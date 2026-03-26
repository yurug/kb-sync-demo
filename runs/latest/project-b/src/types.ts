export interface KbSyncConfig {
  linearApiKey: string;
  teamId: string;
  kbDir: string;
  projectId?: string;
}

export interface IssueFrontmatter {
  id: string;
  title: string;
  status: string;
  priority: number;
  assignee?: string;
  labels?: string[];
  updatedAt: string;
  createdAt: string;
  url: string;
}

export interface LocalIssue {
  frontmatter: IssueFrontmatter;
  content: string;
  filePath: string;
}

export interface SyncStatus {
  localOnly: LocalIssue[];
  remoteOnly: IssueFrontmatter[];
  modified: Array<{ local: LocalIssue; remote: IssueFrontmatter }>;
  unchanged: LocalIssue[];
}

export const CONFIG_FILE = '.kb-sync.json';
export const DEFAULT_KB_DIR = 'kb';
