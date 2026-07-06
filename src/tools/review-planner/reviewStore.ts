import {
  loadNamespaced,
  saveNamespaced,
} from '../../shared/persistence';
import {
  emptyCourseReview,
  emptyModuleReview,
  type CourseReview,
  type ModuleReview,
} from './reviewModel';

// This tool owns the "ucc:reviewPlanner:*" localStorage slice, so its records
// can never collide with the timetable tool's ("ucc:timetable:*").
export const TOOL_ID = 'reviewPlanner';
const DATA_KEY = 'v1';

export interface ReviewData {
  modules: ModuleReview[];
  courses: CourseReview[];
}

/** Seed shown on first visit so the calculations are visible immediately. */
function seed(): ReviewData {
  return {
    modules: [
      {
        ...emptyModuleReview(),
        courseName: 'Data Science',
        moduleName: 'Data Fundamentals',
        plannedStartDate: '2026-07-01',
        actualStartDate: '2026-07-06',
        deliveryMode: 'Series',
      },
      {
        ...emptyModuleReview(),
        courseName: 'Data Science',
        moduleName: 'Applied Analytics',
        plannedStartDate: '2026-08-01',
        actualStartDate: '2026-08-31',
        deliveryMode: 'Parallel',
      },
    ],
    courses: [
      {
        ...emptyCourseReview(),
        courseName: 'Data Science',
        numberOfModules: '2',
        plannedStartDate: '2026-07-01',
        actualStartDate: '2026-07-06',
      },
    ],
  };
}

export function loadReviewData(): ReviewData {
  const stored = loadNamespaced<ReviewData | null>(TOOL_ID, DATA_KEY, null);
  if (stored && Array.isArray(stored.modules) && Array.isArray(stored.courses)) {
    return stored;
  }
  return seed();
}

export function saveReviewData(data: ReviewData): void {
  saveNamespaced(TOOL_ID, DATA_KEY, data);
}
