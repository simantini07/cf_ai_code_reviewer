
export interface StoredReview {
  id: string;
  createdAt: string;
  language: string;
  summary: string;
  snippet: string; // first ~200 chars
}

export class ReviewSessionDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/add" && request.method === "POST") {
      const body = (await request.json()) as StoredReview;
      const key = `review:${body.id}`;
      await this.state.storage.put(key, body);

      const index = (await this.state.storage.get<string[]>("index")) ?? [];
      index.unshift(body.id);
      await this.state.storage.put("index", index.slice(0, 200)); // cap

      return Response.json({ ok: true });
    }

    if (url.pathname === "/list" && request.method === "GET") {
      const ids = (await this.state.storage.get<string[]>("index")) ?? [];
      if (!ids.length) return Response.json({ items: [] });

      const keys = ids.map((id) => `review:${id}`);
      const map = await this.state.storage.get<StoredReview>(keys);
      const items = ids
        .map((id) => map.get(`review:${id}`))
        .filter(Boolean) as StoredReview[];
      return Response.json({ items });
    }

    return new Response("Not Found", { status: 404 });
  }
}
