import { Paper, Note, PaperMetadata } from '../types';
import JSZip from 'jszip';

const DB_NAME = 'ScholarNoteDB';
const DB_VERSION = 5; 
const STORE_PAPERS = 'papers';
const STORE_NOTES = 'notes';
const STORE_CONFIG = 'config';

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction;

      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }

      let notesStore;
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        notesStore = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      } else {
        notesStore = tx!.objectStore(STORE_NOTES);
      }

      // Ensure index exists
      if (!notesStore.indexNames.contains('paperId')) {
        notesStore.createIndex('paperId', 'paperId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn("DB Open Blocked: Close other tabs");
  });
};

export const savePaper = async (paper: Paper): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAPERS, 'readwrite');
    const store = tx.objectStore(STORE_PAPERS);
    const request = store.put(paper);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllPapersMetadata = async (): Promise<PaperMetadata[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAPERS, 'readonly');
    const store = tx.objectStore(STORE_PAPERS);
    const request = store.getAll();
    request.onsuccess = () => {
      // Exclude fileData from the listing to save memory
      const papers = request.result as Paper[];
      const metadata = papers.map(({ fileData, ...rest }) => rest);
      resolve(metadata);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getPaperById = async (id: string): Promise<Paper | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAPERS, 'readonly');
    const store = tx.objectStore(STORE_PAPERS);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deletePaper = async (id: string): Promise<void> => {
  const db = await openDB();
  
  // 1. Delete associated notes first (best effort)
  try {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    if (store.indexNames.contains('paperId')) {
      const index = store.index('paperId');
      const cursorReq = index.openKeyCursor(IDBKeyRange.only(id));
      cursorReq.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    }
  } catch (e) {
    console.warn("Notes cleanup deferred or failed", e);
  }

  // 2. Primary Action: Delete Paper record. 
  // Following the same logic as deleteNote (request.onsuccess) to avoid transaction hang.
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PAPERS, 'readwrite');
    const store = tx.objectStore(STORE_PAPERS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updatePaperTags = async (id: string, tags: string[]): Promise<void> => {
  const paper = await getPaperById(id);
  if (!paper) return;
  paper.tags = tags;
  await savePaper(paper);
};

export const updatePaperTitle = async (id: string, newTitle: string): Promise<void> => {
  const paper = await getPaperById(id);
  if (!paper) return;
  paper.title = newTitle;
  await savePaper(paper);
};

export const updatePaperSummary = async (id: string, summary: string): Promise<void> => {
  const paper = await getPaperById(id);
  if (!paper) return;
  paper.summary = summary;
  await savePaper(paper);
};

export const updatePaperAISummary = async (id: string, aiSummary: string): Promise<void> => {
  const paper = await getPaperById(id);
  if (!paper) return;
  paper.aiSummary = aiSummary;
  await savePaper(paper);
};

// Notes operations

export const saveNote = async (note: Note): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    const request = store.put(note);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getNotesByPaperId = async (paperId: string): Promise<Note[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    const store = tx.objectStore(STORE_NOTES);
    // Fallback if index missing (should happen less now with V5 bump)
    if (store.indexNames.contains('paperId')) {
        const index = store.index('paperId');
        const request = index.getAll(paperId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    } else {
        // Slow fallback: iterate all notes
        const request = store.getAll();
        request.onsuccess = () => {
             const all = request.result as Note[];
             resolve(all.filter(n => n.paperId === paperId));
        };
        request.onerror = () => reject(request.error);
    }
  });
};

export const deleteNote = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTES, 'readwrite');
    const store = tx.objectStore(STORE_NOTES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- CONFIG PERSISTENCE (Backup Handle) ---

export const saveBackupHandle = async (handle: any): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readwrite');
    tx.objectStore(STORE_CONFIG).put(handle, 'backup_handle');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getBackupHandle = async (): Promise<any | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const req = tx.objectStore(STORE_CONFIG).get('backup_handle');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

// --- PORTABLE DATABASE (EXPORT/IMPORT) ---

export const exportDatabase = async (): Promise<Blob> => {
  const zip = new JSZip();
  const db = await openDB();

  // 1. Get All Notes
  const allNotes = await new Promise<Note[]>((resolve) => {
    const tx = db.transaction(STORE_NOTES, 'readonly');
    tx.objectStore(STORE_NOTES).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
  });

  // 2. Get All Papers (with binary data)
  const allPapers = await new Promise<Paper[]>((resolve) => {
    const tx = db.transaction(STORE_PAPERS, 'readonly');
    tx.objectStore(STORE_PAPERS).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
  });

  // 3. Construct JSON DB Structure
  const papersMetadata = allPapers.map(({ fileData, ...rest }) => rest);
  
  const portableDB = {
    version: 1,
    exportedAt: new Date().toISOString(),
    papers: papersMetadata,
    notes: allNotes
  };

  // 4. Add library.json
  zip.file("library.json", JSON.stringify(portableDB, null, 2));

  // 5. Add PDF files to papers/ folder
  const papersFolder = zip.folder("papers");
  if (papersFolder) {
    allPapers.forEach(paper => {
      if (paper.fileData) {
        papersFolder.file(`${paper.id}.pdf`, paper.fileData);
      }
    });
  }

  // 6. Generate ZIP
  return await zip.generateAsync({ type: "blob" });
};

// Automatic Backup Writer
export const writeBackupToHandle = async (fileHandle: any): Promise<void> => {
  const blob = await exportDatabase();
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
};

export const importDatabase = async (zipFile: File): Promise<void> => {
  const zip = await JSZip.loadAsync(zipFile);
  
  // 1. Read library.json
  const libraryFile = zip.file("library.json");
  if (!libraryFile) throw new Error("Invalid backup: library.json not found");
  
  const libraryContent = await libraryFile.async("string");
  const data = JSON.parse(libraryContent);
  
  if (!data.papers || !Array.isArray(data.papers)) throw new Error("Invalid DB format");

  // 2. Clear current DB (Full Restore)
  const db = await openDB();
  const tx = db.transaction([STORE_PAPERS, STORE_NOTES], 'readwrite');
  await new Promise<void>((resolve, reject) => {
      tx.objectStore(STORE_PAPERS).clear();
      tx.objectStore(STORE_NOTES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject();
  });

  // 3. Restore Papers
  for (const meta of data.papers) {
    const pdfFile = zip.file(`papers/${meta.id}.pdf`);
    let fileData: ArrayBuffer | undefined;
    
    if (pdfFile) {
      fileData = await pdfFile.async("arraybuffer");
    } else {
      console.warn(`PDF file for ${meta.id} not found in zip`);
      continue;
    }

    const paper: Paper = {
      ...meta,
      fileData
    };
    await savePaper(paper);
  }

  // 4. Restore Notes
  for (const note of data.notes) {
    await saveNote(note);
  }
};