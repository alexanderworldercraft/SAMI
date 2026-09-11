import { main } from "./compareJapanese.mjs";

main(process.argv.slice(2), { language: "en" }).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
