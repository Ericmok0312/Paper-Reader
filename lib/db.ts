import { Paper, Note, PaperMetadata } from '../types';
import JSZip from 'jszip';

const DB_NAME = 'ScholarNoteDB';
const DB_VERSION = 1;
const STORE_PAPERS = 'papers';
const STORE_NOTES = 'notes';

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NOTES)) {
        const notesStore = db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
        notesStore.createIndex('paperId', 'paperId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PAPERS, STORE_NOTES], 'readwrite');
    const pStore = tx.objectStore(STORE_PAPERS);
    pStore.delete(id);
    
    // Also delete associated notes
    const nStore = tx.objectStore(STORE_NOTES);
    const idx = nStore.index('paperId');
    const idxReq = idx.openCursor(IDBKeyRange.only(id));
    
    idxReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
    const index = store.index('paperId');
    const request = index.getAll(paperId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
  // We strip fileData from the main JSON to keep it lightweight, files go into folders
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
    // Load binary from zip
    const pdfFile = zip.file(`papers/${meta.id}.pdf`);
    let fileData: ArrayBuffer | undefined;
    
    if (pdfFile) {
      fileData = await pdfFile.async("arraybuffer");
    } else {
      console.warn(`PDF file for ${meta.id} not found in zip`);
      continue; // Skip if file missing
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