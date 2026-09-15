import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = () => new HttpError(401, "Please sign in.");
export const forbidden = (message = "You don't have permission to do that.") => new HttpError(403, message);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found.`);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);

/** Parse a JSON body against a schema, turning failures into a 400 with readable messages. */
export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Some fields are invalid.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

export function readSearchParams<T>(request: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw badRequest("Invalid query parameters.", parsed.error.issues);
  return parsed.data;
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wraps a route handler so thrown HttpErrors and ZodErrors become JSON error responses. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: error.message, details: error.details }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return Response.json({ error: "Some fields are invalid.", details: error.issues }, { status: 400 });
      }
      console.error(error);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

/** Converts arbitrary values into plain JSON for Prisma Json columns. */
export function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}
