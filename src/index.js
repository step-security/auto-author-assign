import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import fs from 'fs';
import axios from 'axios';

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = 'toshimaru/auto-author-assign';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';
  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');
  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

function parseUserList(input) {
  return input
    .split(/[\n,]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

async function run() {
  try {
    await validateSubscription();
    const target = context.payload.pull_request || context.payload.issue
    if (target === undefined) {
      throw new Error("Can't get payload. Check you trigger event");
    }
    const { assignees, number, user: { login: author, type } } = target;

    if (assignees.length > 0) {
      core.info("Assigning author has been skipped since the pull request is already assigned to someone");
      return;
    }

    if (type === "Bot") {
      core.info("Assigning author has been skipped since the author is a bot");
      return;
    }

    const skipUsers = parseUserList(core.getInput("skip-users") || "");
    if (skipUsers.includes(author.toLowerCase())) {
      core.info(`Assigning author has been skipped since the author is in skip-users: ${author}`);
      return;
    }

    const token = core.getInput("repo-token", { required: true });
    const octokit = getOctokit(token);
    const result = await octokit.rest.issues.addAssignees({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: number,
      assignees: [author]
    });

    core.debug(JSON.stringify(result));
    core.info(`@${author} has been assigned to the pull request: #${number}`);

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
