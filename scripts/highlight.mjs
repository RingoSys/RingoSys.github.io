import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const languages = { bash, c, cpp, javascript, json, markdown, python, sql, xml, yaml };
const autoLanguages = Object.keys(languages).filter(name => name !== "markdown");
for (const [name, grammar] of Object.entries(languages)) {
  hljs.registerLanguage(name, grammar);
}
hljs.registerAliases(["cuda", "cu"], { languageName: "cpp" });

export function highlightCode(source, language = "") {
  if (language) {
    return hljs.getLanguage(language)
      ? hljs.highlight(source, { language, ignoreIllegals: true }).value
      : "";
  }

  // Small relevance scores often come from terminal output or prose.
  const detected = hljs.highlightAuto(source, autoLanguages);
  return detected.relevance >= 3 ? detected.value : "";
}
