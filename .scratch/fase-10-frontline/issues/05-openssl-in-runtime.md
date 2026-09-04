# 05: OpenSSL no estágio de runtime

**What to build:** o boot deixa de emitir warning de detecção de OpenSSL, e a engine do Prisma
passa a ser escolha explícita em vez de default silencioso. Funciona hoje, mas é frágil em
ARM64 e em bump de imagem base — o tipo de coisa que quebra num upgrade sem ninguém relacionar
a causa.

**Blocked by:** None (can start immediately). Toca só o Dockerfile, então é a issue de infra que
pode ser feita a qualquer momento, inclusive antes da 01.

**Status:** ready-for-agent

- [ ] OpenSSL instalado no estágio de runtime da imagem.
- [ ] O boot não emite mais o warning de detecção.
- [ ] O tamanho da imagem final é registrado antes e depois, para o custo ser conhecido.
- [ ] **Verificação manual:** subir o container de produção e ler o log de inicialização.
