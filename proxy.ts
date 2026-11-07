import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// A convenience redirect for signed-out visitors, not a security boundary. Authorization is
// enforced in the Convex functions, which is where the data lives.
const isProtectedRoute = createRouteMatcher([
  "/tools(.*)",
  "/listings(.*)",
  "/requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
