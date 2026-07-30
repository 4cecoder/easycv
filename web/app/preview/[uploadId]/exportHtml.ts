export type ProfileData = {
  name?: string;
  titles?: string[];
  summary?: string;
  skills?: Record<string, string[]>;
  experience?: Array<{
    title?: string;
    company?: string;
    start?: string;
    end?: string;
    location?: string;
    bullets: string[];
  }>;
  education?: Array<{
    degree?: string;
    school?: string;
    years?: string;
  }>;
  certifications?: string[];
};

export function exportHtmlResume(
  profile: ProfileData,
  template: "modern" | "classic" | "minimal",
  fontSize: "sm" | "base" | "lg",
  primaryColor: "blue" | "emerald" | "slate" | "violet"
) {
  const colorMap = {
    blue: { primary: "#2563eb", light: "#eff6ff", border: "#bfdbfe" },
    emerald: { primary: "#059669", light: "#ecfdf5", border: "#a7f3d0" },
    violet: { primary: "#7c3aed", light: "#f5f3ff", border: "#ddd6fe" },
    slate: { primary: "#1e293b", light: "#f1f5f9", border: "#cbd5e1" },
  };

  const colors = colorMap[primaryColor];
  const fontStyles = {
    modern: "font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; letter-spacing: -0.01em;",
    classic: "font-family: Georgia, Cambria, 'Times New Roman', Times, serif; letter-spacing: 0;",
    minimal: "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; letter-spacing: -0.02em;",
  };

  const sizes = {
    sm: "font-size: 13px; line-height: 1.5; padding: 24px; max-width: 700px;",
    base: "font-size: 14px; line-height: 1.6; padding: 32px; max-width: 800px;",
    lg: "font-size: 15px; line-height: 1.7; padding: 40px; max-width: 900px;",
  };

  const headingStyles = {
    modern: `font-size: 12px; font-weight: bold; text-transform: uppercase; color: ${colors.primary}; border-left: 2px solid ${colors.primary}; padding-left: 8px; margin: 20px 0 10px 0;`,
    classic: `font-size: 12px; font-weight: bold; text-transform: uppercase; text-align: center; color: ${colors.primary}; border-bottom: 1px solid ${colors.border}; padding-bottom: 4px; margin: 24px 0 12px 0; width: 100%;`,
    minimal: `font-size: 12px; font-weight: 900; text-transform: uppercase; color: #1e293b; margin: 20px 0 10px 0; letter-spacing: 0.05em;`,
  };

  const nameStyles = {
    modern: `font-size: 28px; font-weight: 800; color: ${colors.primary}; margin: 0 0 4px 0;`,
    classic: `font-size: 32px; font-weight: bold; text-align: center; color: ${colors.primary}; margin: 0 0 6px 0;`,
    minimal: `font-size: 26px; font-weight: 300; color: #0f172a; margin: 0 0 4px 0;`,
  };

  // Generate skills markup
  let skillsHtml = "";
  if (profile.skills) {
    const skillLabels = [
      ["languages", "Languages"],
      ["frameworks", "Frameworks"],
      ["cloud_devops", "Cloud/DevOps"],
      ["databases", "Databases"],
      ["tools", "Tools"],
    ];
    let skillRows = "";
    for (const [key, label] of skillLabels) {
      const items = profile.skills[key];
      if (items && items.length > 0) {
        const badges = items
          .map(
            (item) =>
              `<span style="display: inline-block; border: 1px solid ${colors.border}; color: ${colors.primary}; background-color: ${colors.light}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 2px;">${item}</span>`
          )
          .join("");
        skillRows += `
          <div style="display: flex; align-items: start; margin-bottom: 8px;">
            <span style="width: 100px; flex-shrink: 0; font-weight: 600; color: #475569; font-size: 12px;">${label}</span>
            <div style="display: flex; flex-wrap: wrap; flex: 1;">${badges}</div>
          </div>`;
      }
    }

    if (skillRows) {
      skillsHtml = `
        <section>
          <h2 style="${headingStyles[template]}">Skills</h2>
          <div>${skillRows}</div>
        </section>`;
    }
  }

  // Generate experience markup
  let expHtml = "";
  if (profile.experience && profile.experience.length > 0) {
    const articles = profile.experience
      .map((entry) => {
        const headerLeft = entry.company
          ? `${entry.title ?? "Role"} — ${entry.company}`
          : (entry.title ?? "Role");
        const dateRange = [entry.start, entry.end].filter(Boolean).join(" - ");
        const locationText = entry.location ? ` (${entry.location})` : "";
        const bulletsList =
          entry.bullets && entry.bullets.length > 0
            ? `<ul style="margin: 6px 0 0 16px; padding: 0; list-style-type: disc; color: #475569;">
                ${entry.bullets.map((b) => `<li style="margin-bottom: 4px; line-height: 1.5;">${b}</li>`).join("")}
               </ul>`
            : "";

        return `
          <article style="margin-bottom: 16px; page-break-inside: avoid;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap;">
              <h3 style="margin: 0; font-size: 13px; font-weight: bold; color: #0f172a;">${headerLeft}</h3>
              <span style="font-size: 11px; color: #64748b; font-weight: 500;">${dateRange}${locationText}</span>
            </div>
            ${bulletsList}
          </article>`;
      })
      .join("");

    expHtml = `
      <section>
        <h2 style="${headingStyles[template]}">Experience</h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">${articles}</div>
      </section>`;
  }

  // Generate education markup
  let eduHtml = "";
  if (profile.education && profile.education.length > 0) {
    const listItems = profile.education
      .map((entry) => {
        const degree = entry.degree ? `<span style="font-weight: 600; color: #1e293b;">${entry.degree}</span>` : "";
        const school = entry.school ? ` — ${entry.school}` : "";
        const years = entry.years ? ` <span style="color: #64748b;">(${entry.years})</span>` : "";
        return `<li style="margin-bottom: 6px;">${degree}${school}${years}</li>`;
      })
      .join("");

    eduHtml = `
      <section>
        <h2 style="${headingStyles[template]}">Education</h2>
        <ul style="margin: 0; padding: 0; list-style: none; color: #475569;">${listItems}</ul>
      </section>`;
  }

  // Generate certifications markup
  let certsHtml = "";
  if (profile.certifications && profile.certifications.length > 0) {
    const badges = profile.certifications
      .map(
        (cert) =>
          `<span style="display: inline-block; border: 1px solid ${colors.border}; color: ${colors.primary}; background-color: ${colors.light}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 2px;">${cert}</span>`
      )
      .join("");

    certsHtml = `
      <section>
        <h2 style="${headingStyles[template]}">Certifications</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">${badges}</div>
      </section>`;
  }

  // Header section
  const titleLine = profile.titles && profile.titles.length > 0
    ? `<p style="margin: 4px 0; color: #475569; font-weight: 500; font-size: 13px;">${profile.titles.join(" / ")}</p>`
    : "";

  const contact = [];
  if (profile.name) contact.push(profile.name); // fallback placeholder

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${profile.name ?? "Resume"}</title>
  <style>
    body {
      margin: 0 auto;
      background-color: #ffffff;
      color: #334155;
      -webkit-font-smoothing: antialiased;
      ${fontStyles[template]}
      ${sizes[fontSize]}
    }
    h1, h2, h3, h4, p, ul, li {
      margin-top: 0;
    }
    section {
      margin-bottom: 24px;
    }
    @media print {
      body {
        padding: 0;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <header style="margin-bottom: 20px; ${template === "classic" ? "text-align: center;" : ""}">
    <h1 style="${nameStyles[template]}">${profile.name ?? "Resume"}</h1>
    ${titleLine}
  </header>

  ${profile.summary ? `<section><h2 style="${headingStyles[template]}">Summary</h2><p style="margin: 0; color: #475569; line-height: 1.6;">${profile.summary}</p></section>` : ""}

  ${skillsHtml}
  ${expHtml}
  ${eduHtml}
  ${certsHtml}
</body>
</html>`;

  // Trigger browser download
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(profile.name ?? "resume").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-resume.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
