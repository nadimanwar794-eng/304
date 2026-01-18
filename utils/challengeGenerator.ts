import { ClassLevel, Board, Stream, MCQItem, SystemSettings } from '../types';
import { getSubjectsList, DEFAULT_SUBJECTS } from '../constants';
import { getChapterData } from '../firebase';

export const generateDailyChallengeQuestions = async (
    classLevel: ClassLevel,
    board: Board,
    stream: Stream | null,
    settings: SystemSettings,
    userId: string
): Promise<{ questions: MCQItem[], name: string, id: string }> => {
    
    // 1. Determine Source Chapters
    let sourceChapterIds: string[] = [];
    const subjects = getSubjectsList(classLevel, stream);
    
    // Get ALL Chapter IDs if AUTO, or Filtered if MANUAL
    if (settings.dailyChallengeConfig?.mode === 'MANUAL' && settings.dailyChallengeConfig.selectedChapterIds?.length) {
        // Use only what Admin selected
        sourceChapterIds = settings.dailyChallengeConfig.selectedChapterIds;
    } else {
        // AUTO MODE: We need to find ALL chapters for this class/board
        // Since we don't have a master index of ALL chapters in one place easily without scanning,
        // we will iterate through the syllabus structure we know.
        // This relies on `nst_custom_chapters_...` keys being present in localStorage or fetching them.
        
        // Strategy: Iterate subjects -> fetch syllabus -> collect IDs
        // To be fast, we might rely on what's locally cached or just fetch blindly?
        // Better: Iterate localStorage keys starting with `nst_content_{board}_{class}`
        
        const prefix = `nst_content_${board}_${classLevel}`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                // Key format: nst_content_CBSE_10_Math_chapterId
                // We just need the key to load data
                const parts = key.split('_');
                // Ensure it belongs to current stream if applicable
                // Key structure might contain stream in Class part? e.g. "12-Science"
                // Let's rely on standard key formation: `nst_content_${board}_${classLevel}${streamKey}_${subject}_${chapterId}`
                
                const streamKey = (classLevel === '11' || classLevel === '12') ? `-${stream}` : '';
                const expectedPrefix = `nst_content_${board}_${classLevel}${streamKey}`;
                
                if (key.startsWith(expectedPrefix)) {
                    // Extract Chapter ID (last part usually, but could be tricky if subject has underscores)
                    // Actually we just need to load the content of this key
                    sourceChapterIds.push(key); // Storing KEY instead of ID for direct access
                }
            }
        }
    }

    // 2. Aggregate Questions
    let allQuestions: MCQItem[] = [];
    const usedQuestions = new Set<string>();

    for (const source of sourceChapterIds) {
        let content: any = null;
        
        // If source is a full Key (from Auto loop)
        if (source.startsWith('nst_content_')) {
            const stored = localStorage.getItem(source);
            if (stored) content = JSON.parse(stored);
        } 
        // If source is just an ID (from Manual config), we need to search for it or Admin must have saved it?
        // The Admin UI saves `selectedChapterIds` as plain IDs. We need to find their parent subject to load.
        // This is tricky. 
        // FIX: Admin Manual Selection stores IDs. We need to find the content key for that ID.
        // In Manual Mode, we might need to iterate keys to find which one contains the chapter ID.
        else {
             // Manual Mode Logic: iterate all keys and check if they end with this ID?
             // Or simpler: The Admin UI should probably store the FULL KEY or we search.
             // Let's assume for now we search localStorage for keys containing the ID.
             for (let i = 0; i < localStorage.length; i++) {
                 const k = localStorage.key(i);
                 if (k && k.includes(source) && k.startsWith('nst_content_')) {
                     const stored = localStorage.getItem(k);
                     if (stored) content = JSON.parse(stored);
                     break;
                 }
             }
        }

        if (content) {
            // Collect Manual MCQs
            if (content.manualMcqData && Array.isArray(content.manualMcqData)) {
                content.manualMcqData.forEach((q: MCQItem) => {
                    if (!usedQuestions.has(q.question)) {
                        allQuestions.push(q);
                        usedQuestions.add(q.question);
                    }
                });
            }
            // Collect Weekly Test MCQs (why not?)
            if (content.weeklyTestMcqData && Array.isArray(content.weeklyTestMcqData)) {
                content.weeklyTestMcqData.forEach((q: MCQItem) => {
                    if (!usedQuestions.has(q.question)) {
                        allQuestions.push(q);
                        usedQuestions.add(q.question);
                    }
                });
            }
        }
    }

    // 3. Shuffle and Slice
    // Fisher-Yates Shuffle
    for (let i = allQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    // Limit to 100
    const finalQuestions = allQuestions.slice(0, 100);

    // 4. Return formatted object ready for WeeklyTestView
    const today = new Date().toDateString(); // "Mon Jan 01 2024"
    return {
        id: `daily-challenge-${userId}-${today.replace(/\s/g, '-')}`,
        name: `Daily Challenge (${today})`,
        questions: finalQuestions
    };
};
