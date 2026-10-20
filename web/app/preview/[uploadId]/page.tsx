import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ uploadId: string }>;
};

export default async function PreviewPage({ params }: PageProps) {
  const { uploadId } = await params;
  return <PreviewClient uploadId={uploadId} />;
}
