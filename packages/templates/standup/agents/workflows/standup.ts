import { defineWorkflow } from "@generata/core";
import gitSummariser from "../git-summariser.js";
import standupWriter from "../standup-writer.js";

export default defineWorkflow({
  description: "Read yesterday's git activity and draft a daily standup",
  variables: { repo: "", today_focus: "" },
  steps: [
    { id: "summarise", agent: gitSummariser },
    {
      id: "write",
      agent: standupWriter,
      args: ({ summarise, today_focus }) => ({
        git_summary: summarise,
        today_focus,
      }),
      dependsOn: ["summarise"],
    },
  ],
});
