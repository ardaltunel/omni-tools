(function initGithubMdStyleProfiles(root) {
    "use strict";

    const ardaGithubDocsV1 = Object.freeze({
        id: "arda-github-docs-v1",
        label: "Arda GitHub Belgeleri v1",
        separator: "---",
        headingLevel: 1,
        principles: Object.freeze([
            "Start with a concise, repository-specific introduction.",
            "Use emoji-led section headings and horizontal separators.",
            "Prefer concrete checklists, numbered workflows, and fenced command examples.",
            "Include only repository evidence or explicitly supplied manual context.",
            "Keep security warnings visible and never invent contacts, support promises, or credentials.",
        ]),
        icons: Object.freeze({
            features: "🌍",
            technologies: "🚀",
            installation: "⚙️",
            usage: "💻",
            structure: "📂",
            contributing: "🤝",
            license: "📄",
            context: "📝",
            versions: "🛡️",
            reporting: "🚨",
            disclosure: "⚠️",
            response: "🔐",
            help: "🧭",
            beforeIssue: "✅",
            bugs: "🐛",
            requests: "✨",
            questions: "💬",
            setup: "⚙️",
            workflow: "🔄",
            branches: "🌿",
            commits: "📝",
            pullRequests: "🚀",
            standards: "🧱",
            issues: "📌",
            pledge: "🤝",
            behavior: "✅",
            unacceptable: "❌",
            enforcement: "⚖️",
            scope: "🌐",
            conductReporting: "📬",
            attribution: "📄",
            contents: "📑",
            ways: "✨",
            testing: "🧪",
            security: "🔒",
            documentation: "📚",
            review: "🔎",
        }),
    });

    root.GithubMdStyleProfiles = Object.freeze({
        defaultProfileId: ardaGithubDocsV1.id,
        profiles: Object.freeze({ [ardaGithubDocsV1.id]: ardaGithubDocsV1 }),
        getDefault() {
            return ardaGithubDocsV1;
        },
    });
}(window));
