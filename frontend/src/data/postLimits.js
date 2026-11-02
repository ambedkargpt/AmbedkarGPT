// How many posts one user can generate from one story. The server enforces it
// (MAX_POSTS_PER_STORY in backend/services/posts_service.py); the page only
// reads it to show "2/5" and to stop offering a sixth.
export const MAX_POSTS_PER_STORY = 5;
