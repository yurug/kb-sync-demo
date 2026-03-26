import { LinearClient, Issue, Team } from '@linear/sdk';
import { IssueFrontmatter } from './types.js';

export function createLinearClient(apiKey: string): LinearClient {
  return new LinearClient({ apiKey });
}

export async function fetchTeam(client: LinearClient, teamId: string): Promise<Team> {
  const team = await client.team(teamId);
  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }
  return team;
}

export async function fetchIssues(client: LinearClient, teamId: string, projectId?: string): Promise<IssueFrontmatter[]> {
  const team = await fetchTeam(client, teamId);
  const filter: Record<string, unknown> = {};
  if (projectId) {
    filter.project = { id: { eq: projectId } };
  }

  const issues = await team.issues({ filter });
  const nodes = issues.nodes;

  const results: IssueFrontmatter[] = [];
  for (const issue of nodes) {
    results.push(await issueToFrontmatter(issue));
  }
  return results;
}

export async function issueToFrontmatter(issue: Issue): Promise<IssueFrontmatter> {
  const state = await issue.state;
  const assignee = await issue.assignee;
  const labels = await issue.labels();

  return {
    id: issue.id,
    title: issue.title,
    status: state?.name ?? 'Unknown',
    priority: issue.priority,
    assignee: assignee?.name,
    labels: labels.nodes.map(l => l.name),
    updatedAt: issue.updatedAt.toISOString(),
    createdAt: issue.createdAt.toISOString(),
    url: issue.url,
  };
}

export async function createIssue(
  client: LinearClient,
  teamId: string,
  title: string,
  description: string,
  priority?: number,
): Promise<Issue> {
  const payload = await client.createIssue({
    teamId,
    title,
    description,
    priority: priority ?? 0,
  });
  const issue = await payload.issue;
  if (!issue) {
    throw new Error('Failed to create issue');
  }
  return issue;
}

export async function updateIssue(
  client: LinearClient,
  issueId: string,
  updates: { title?: string; description?: string; priority?: number },
): Promise<Issue> {
  const payload = await client.updateIssue(issueId, updates);
  const issue = await payload.issue;
  if (!issue) {
    throw new Error(`Failed to update issue: ${issueId}`);
  }
  return issue;
}
