type SearchParamsLike = {
  get: (key: string) => string | null;
};

const isMockParam = (value: string | null) =>
  value === '' || value === '1' || value === 'true' || value === 'yes';

export type MockConfig = {
  isMock: boolean;
  mockState: string | null;
  mockQuery: string;
};

export const getMockConfig = (searchParams: SearchParamsLike | null): MockConfig => {
  const mockParam = searchParams?.get('mock') ?? null;
  const isMock = isMockParam(mockParam);
  const mockState = searchParams?.get('state') ?? null;
  const mockQuery = mockState ? `?mock=1&state=${encodeURIComponent(mockState)}` : '?mock=1';
  return { isMock, mockState, mockQuery };
};
