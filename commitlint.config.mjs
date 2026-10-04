// Conventional Commits + trailer obrigatório "Co-authored-by:" (AGENTS.md).
const coAuthorTrailer = (parsed, when = "always") => {
  const has = /^co-authored-by:\s+.+<.+@.+>\s*$/im.test(parsed.raw ?? "");
  return [
    when === "always" ? has : !has,
    'a mensagem deve terminar com o trailer "Co-authored-by: Nome <email>" (ver AGENTS.md)',
  ];
};

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "co-authored-by-trailer": coAuthorTrailer } }],
  rules: {
    "co-authored-by-trailer": [2, "always"],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "header-max-length": [2, "always", 120],
    "subject-case": [0],
  },
};
