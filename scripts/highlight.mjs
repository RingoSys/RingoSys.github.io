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
for (const [name, grammar] of Object.entries(languages)) {
  hljs.registerLanguage(name, grammar);
}
hljs.registerAliases(["cuda", "cu"], { languageName: "cpp" });

export function highlightCode(source, language) {
  if (!language || !hljs.getLanguage(language)) {
    return "";
  }
  return hljs.highlight(source, { language, ignoreIllegals: true }).value;
}
