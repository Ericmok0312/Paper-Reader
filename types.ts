export interface Paper {
  id: string;
  title: string;
  fileData: ArrayBuffer; // Stored in IndexedDB
  fileName: string;
  tags: string[];
  summary?: string; // User written summary
  uploadedAt: number;
  lastReadAt: number;
}

export interface HighlightArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Note {
  id: string;
  paperId: string;
  pageNumber: number;
  quote: string; // The selected text
  comment: string; // The user's note
  tags: string[]; // Linked knowledge tags
  highlightAreas: HighlightArea[]; // Coordinates for rendering highlights
  createdAt: number;
  color: 'yellow' | 'green' | 'blue' | 'red';
}

export interface PaperMetadata {
  id: string;
  title: string;
  fileName: string;
  tags: string[];
  uploadedAt: number;
  lastReadAt: number;
}

export enum ViewState {
  LIBRARY = 'LIBRARY',
  READER = 'READER',
  GRAPH = 'GRAPH'
}

export interface AppSettings {
  highlightColor: 'yellow' | 'green' | 'blue' | 'red';
  apiBaseUrl?: string; // For OpenAI compatible endpoints
  aiModel?: string;
  // Custom Prompts
  promptSuggestTags?: string;
  promptReorganizeNote?: string;
  promptOrganizeSummary?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'error';
  data?: any; // Result data (e.g. suggested tags)
  action?: 'APPLY_TAGS' | 'VIEW_RESULT';
}