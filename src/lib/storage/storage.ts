import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/config/env";
import { createInternalServerError } from "@/errors";

/**
 * Camada **burra** de bytes: põe, apaga e diz a URL. Não sabe o que é imagem,
 * não sabe o que é produto — quem sabe é `image.ts`, um degrau acima.
 *
 * A interface existe para que trocar disco local por S3/MinIO seja implementar
 * três métodos, e não caçar `fs` espalhado pelo projeto (N13). Hoje há uma
 * implementação só, e é de propósito: o adaptador é a costura, não a promessa
 * de que já existe um segundo backend.
 *
 * O que ela **não** faz é servir o byte. Quem serve hoje é o próprio Node
 * (`express.static`, 9.10/AA2), porque o reverse proxy que o ADR pressupunha
 * não existe neste repositório — vive no servidor onde a demo é hospedada. O
 * banco guarda a chave, nunca a URL, então trocar o servidor de estático é
 * configuração: nenhuma linha gravada precisa mudar.
 */
export interface Storage {
  /** Grava (ou sobrescreve) o arquivo em `key`, criando o caminho. */
  put(key: string, data: Buffer): Promise<void>;
  /** Apaga `key`. Idempotente: apagar o que não existe não é erro. */
  delete(key: string): Promise<void>;
  /** Apaga o diretório `prefix` inteiro. Idempotente. */
  deleteDirectory(prefix: string): Promise<void>;
  /** URL pública de `key`, derivada de `UPLOAD_PUBLIC_BASE_URL`. */
  url(key: string): string;
}

export class LocalDiskStorage implements Storage {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(
    root: string = env.UPLOAD_DIR,
    baseUrl = env.UPLOAD_PUBLIC_BASE_URL,
  ) {
    this.root = path.resolve(root);
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * Guarda contra path traversal. Hoje toda chave é gerada por nós (uuid), e
   * nome de usuário nunca chega até aqui — este método é a rede embaixo dessa
   * afirmação, para o dia em que alguém acrescentar um call site que a esqueça.
   */
  private resolveInsideRoot(key: string): string {
    const resolved = path.resolve(this.root, key);

    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw createInternalServerError({
        message: "Caminho de upload fora do diretório permitido",
      });
    }

    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolveInsideRoot(key);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveInsideRoot(key), { force: true });
  }

  async deleteDirectory(prefix: string): Promise<void> {
    await fs.rm(this.resolveInsideRoot(prefix), {
      recursive: true,
      force: true,
    });
  }

  url(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

export const storage: Storage = new LocalDiskStorage();
