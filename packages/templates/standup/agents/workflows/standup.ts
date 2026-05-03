import { defineWorkflow } from "@generata/core";
import gitSummariser from "../git-summariser.js";
import standupWriter from "../standup-writer.js";

export default defineWorkflow({
  description: "Read yesterday's git activity and draft a daily standup",
  variables: { repo: "", today_focus: "" },
})
  .step("summarise", ({ repo }) => gitSummariser({ repo }))
  .step("write", ({ summarise, today_focus }) =>
    standupWriter({ git_summary: summarise, today_focus }),
  )
  .build();
