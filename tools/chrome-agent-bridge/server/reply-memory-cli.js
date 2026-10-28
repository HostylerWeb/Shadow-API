#!/usr/bin/env node
import {
  addBannedPhrase,
  checkReplyDraft,
  getMemoryDbPath,
  getRecentReplies,
  getWhatYouSaidBrief,
  initReplyMemory,
} from "./reply-memory.js";

initReplyMemory();

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.join(" ").trim();

switch (cmd) {
  case "list":
    console.log(getMemoryDbPath());
    console.log(JSON.stringify(getRecentReplies(40), null, 2));
    break;
  case "what-you-said":
    console.log(getWhatYouSaidBrief({ limit: 40 }));
    break;
  case "check":
    if (!arg) {
      console.error("usage: reply-memory-cli.js check <draft text>");
      process.exit(1);
    }
    console.log(JSON.stringify(checkReplyDraft(arg), null, 2));
    break;
  case "ban":
    if (!arg) {
      console.error("usage: reply-memory-cli.js ban <phrase>");
      process.exit(1);
    }
    console.log(JSON.stringify(addBannedPhrase(arg), null, 2));
    break;
  default:
    console.log(`Reply memory: ${getMemoryDbPath()}
Commands: list | what-you-said | check <text> | ban <phrase>`);
}
