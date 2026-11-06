export const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development'
    ? 'http://localhost:4000'
    : '');
