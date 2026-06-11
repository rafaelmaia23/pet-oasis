declare namespace Express {
  interface Request {
    user?: {
      id: string;
      features: { name: string }[];
    };
  }
}
