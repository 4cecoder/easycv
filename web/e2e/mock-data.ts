export const MOCK_UPLOAD = {
  _id: "seed-demo-upload-id",
  status: "ready",
  structuredProfile: {
    name: "Alex Mercer",
    titles: ["Senior Software Engineer"],
    summary:
      "Results-driven software engineer with 8+ years building scalable distributed systems.",
    contact: {
      email: "alex@example.com",
      phone: "555-0100",
      linkedin: "linkedin.com/in/alexmercer",
    },
    skills: {
      languages: ["TypeScript", "Python", "Go"],
      frameworks: ["React", "Next.js", "Node.js"],
      cloud_devops: ["AWS", "Docker", "Kubernetes", "CI/CD"],
      databases: ["PostgreSQL", "MongoDB", "Redis"],
      tools: ["Git", "Jira", "Datadog"],
    },
    experience: [
      {
        title: "Senior Software Engineer",
        company: "Acme Corp",
        start: "2021-01",
        end: "Present",
        location: "Remote",
        bullets: [
          "Architected a microservices platform that handles 2M+ daily API requests with 99.99% uptime.",
          "Led a cross-functional team of 5 engineers to deliver a real-time analytics dashboard.",
          "Reduced average API latency by 40% through query optimization and caching strategies.",
        ],
      },
    ],
    education: [
      {
        degree: "B.S. Computer Science",
        school: "MIT",
        years: "2012 – 2016",
      },
    ],
    certifications: ["AWS Solutions Architect – Associate"],
    qualityScore: 92,
    qualityMaxScore: 100,
    qualityCritical: false,
    qualityWarnings: [],
  },
  files: [],
};

export const MOCK_JOB_MATCH_RESULT = {
  matchScore: 78,
  matchedKeywords: [
    "TypeScript",
    "React",
    "AWS",
    "microservices",
    "REST API",
    "CI/CD",
    "PostgreSQL",
  ],
  missingKeywords: [
    "Kafka",
    "GraphQL",
    "Terraform",
    "system design",
  ],
  gapAnalysis:
    "Your profile demonstrates strong backend and cloud competency. To close the gap, highlight direct experience with event-driven architectures (Kafka) and infrastructure-as-code (Terraform). Consider adding examples of GraphQL API design and large-scale system design sessions.",
  tailoredBullets: [
    "Architected and deployed a microservices platform on AWS using TypeScript and Docker, serving 2M+ daily requests with 99.99% uptime via CI/CD pipelines.",
    "Optimized PostgreSQL query performance by 40%, implementing Redis caching layers to reduce API latency across production workloads.",
    "Led a cross-functional team of 5 engineers to deliver a React-based real-time analytics dashboard integrated with REST APIs and PostgreSQL data stores.",
  ],
};

export const MOCK_PAYMENT_STATUS = {
  paid: false,
  downloadToken: null,
};

