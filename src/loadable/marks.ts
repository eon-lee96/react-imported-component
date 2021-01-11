import { Loadable, Mark, Stream } from '../types';
import { checkStream, clearStream, defaultStream } from './stream';
import { markerOverlap } from './utils';

interface MarkPair {
  mark: Mark;
  loadable: Loadable<any>;
}

const LOADABLE_MARKS = new Map<string, MarkPair>();

export const useMark = (stream: Stream = defaultStream, marks: string[]) => {
  checkStream(stream);
  if (marks && marks.length) {
    marks.forEach(a => (stream.marks[a] = true));
  }
};

export const assignLoadableMark = (mark: Mark, loadable: Loadable<any>) => {
  LOADABLE_MARKS.set(JSON.stringify(mark), { mark, loadable });
};

/**
 * returns marks used in the stream
 * @param stream
 */
export const getUsedMarks = (stream: Stream = defaultStream): string[] => (stream ? Object.keys(stream.marks) : []);

/**
 * SSR
 * @returns list or marks used
 */
export const drainHydrateMarks = (stream: Stream = defaultStream) => {
  checkStream(stream);
  const marks = getUsedMarks(stream);
  clearStream(stream);
  return marks;
};

/**
 * Loads a given marks/chunks
 * @param marks
 * @returns a resolution promise
 */
export const rehydrateMarks = (marks?: string[]) => {
  const rehydratedMarks: string[] = marks || (global as any).___REACT_DEFERRED_COMPONENT_MARKS || [];
  const tasks: Array<Promise<any>> = [];

  const usedMarks = new Set<string>();

  const createTask = ({ mark, loadable }: MarkPair) => {
    if (markerOverlap(mark, rehydratedMarks)) {
      mark.forEach(m => usedMarks.add(m));
      tasks.push(loadable.load());
    }
  };

  LOADABLE_MARKS.forEach(createTask);

  let lastLoadableMarksKey = Array.from(LOADABLE_MARKS.keys());
  const handleNestedMarks = (): Promise<void> => {
    const nextLoadableMarksKey = Array.from(LOADABLE_MARKS.keys());
    if (lastLoadableMarksKey.length === nextLoadableMarksKey.length) {
      return Promise.resolve();
    }
    const newMarks = nextLoadableMarksKey.slice(lastLoadableMarksKey.length - nextLoadableMarksKey.length);
    newMarks
      .map(k => {
        return LOADABLE_MARKS.get(k) as MarkPair;
      })
      .forEach(createTask);
    lastLoadableMarksKey = nextLoadableMarksKey;
    return Promise.all(tasks).then(handleNestedMarks);
  };

  return Promise.all(tasks)
    .then(handleNestedMarks)
    .then(() => {
      rehydratedMarks.forEach(m => {
        if (!usedMarks.has(m)) {
          throw new Error(
            `react-imported-component: unknown mark(${m}) has been used. Client and Server should have the same babel configuration.`
          );
        }
      });
    });
};

/**
 * waits for the given marks to load
 * @param marks
 */
export const waitForMarks = (marks: string[]) => {
  const tasks: Array<Promise<any>> = [];

  LOADABLE_MARKS.forEach(({ mark, loadable }) => {
    if (markerOverlap(mark, marks)) {
      tasks.push(loadable.resolution);
    }
  });

  return Promise.all(tasks);
};

/**
 * @returns a <script> tag with all used marks
 */
export const printDrainHydrateMarks = (stream?: Stream) => {
  checkStream(stream);
  return `<script>window.___REACT_DEFERRED_COMPONENT_MARKS=${JSON.stringify(drainHydrateMarks(stream))};</script>`;
};
