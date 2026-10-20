"""Worker behaviour after the Seridian OIDC cutover (EASYC-5) and the
upload-safety findings from the pre-launch audit.

- Profile/PDF writes must use the worker-secret mutations: the owner-gated
  ones need an end-user identity the worker never has.
- Filenames are attacker-controlled: they may only contribute an allowlisted
  extension, never a path.
- Downloads are size-capped.
"""

import os
from unittest import mock

import pytest

from backend import worker


class TestSafeDownloadPath:
    """Filenames may contribute only an allowlisted extension, never a path."""

    def test_regression_traversal_filename_cannot_escape_job_dir(self, tmp_path):
        path = worker.safe_download_path(str(tmp_path), 0, "../../home/easycv/.bashrc.pdf")
        assert os.path.dirname(path) == os.path.realpath(tmp_path)
        assert os.path.basename(path) == "0.pdf"

    def test_absolute_filename_is_reduced_to_extension(self, tmp_path):
        path = worker.safe_download_path(str(tmp_path), 3, "/etc/passwd.txt")
        assert path == os.path.join(os.path.realpath(tmp_path), "3.txt")

    @pytest.mark.parametrize("name", ["evil.sh", "noext", "resume.pdf.exe", ""])
    def test_unsupported_extensions_are_refused(self, tmp_path, name):
        with pytest.raises(ValueError):
            worker.safe_download_path(str(tmp_path), 0, name)


class _FakeResponse:
    """Minimal streaming stand-in for requests.Response."""

    def __init__(self, chunks):
        self._chunks = chunks

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=0):
        yield from self._chunks


class TestDownloadCapped:
    """Downloads stream to disk and stop past the byte cap."""

    def test_writes_small_files(self, tmp_path):
        target = tmp_path / "0.txt"
        with mock.patch.object(worker.requests, "get", return_value=_FakeResponse([b"hello ", b"world"])):
            worker.download_capped("https://files.example/x", str(target), limit=100)
        assert target.read_bytes() == b"hello world"

    def test_regression_oversized_download_is_refused(self, tmp_path):
        target = tmp_path / "0.pdf"
        with mock.patch.object(worker.requests, "get", return_value=_FakeResponse([b"x" * 60, b"x" * 60])):
            with pytest.raises(ValueError, match="exceeds"):
                worker.download_capped("https://files.example/x", str(target), limit=100)


def test_regression_process_upload_uses_only_worker_secret_mutations(tmp_path):
    """EASYC-5: no owner-gated mutation may be called by the worker."""
    client = mock.MagicMock()
    client.query.side_effect = lambda name, args: (
        [{"url": "https://files.example/a", "filename": "../a.txt"}]
        if name == "resumeFiles:getResumeFilesForWorker"
        else {"jobDescription": ""}
    )
    client.mutation.side_effect = lambda name, args: (
        "https://upload.example" if name == "files:workerGenerateUploadUrl" else None
    )
    pdf = tmp_path / "out.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    result = {
        "tmp_dir": None,
        "profile": {"name": "Ada"},
        "score": {"score": 10, "max_score": 15, "warnings": [], "critical": False},
        "pdf_path": str(pdf),
    }
    post = mock.MagicMock()
    post.return_value.json.return_value = {"storageId": "kg2storage"}
    with mock.patch.object(worker, "download_capped"), \
         mock.patch.object(worker.pipeline, "consolidate_files", return_value=result), \
         mock.patch.object(worker, "LLMClient"), \
         mock.patch.object(worker.requests, "post", post):
        worker.process_upload(client, "https://convex.example", "s3cret", "upload1")

    called = [c.args[0] for c in client.mutation.call_args_list]
    assert "profiles:saveStructuredProfile" not in called
    assert "profiles:setProfilePdf" not in called
    assert "files:generateUploadUrl" not in called
    for name in ("profiles:workerSaveStructuredProfile", "profiles:workerSetProfilePdf",
                 "files:workerGenerateUploadUrl", "uploads:markReady"):
        assert name in called, f"worker must call {name}"
    for c in client.mutation.call_args_list:
        assert c.args[1].get("workerSecret") == "s3cret", f"{c.args[0]} must carry the worker secret"
