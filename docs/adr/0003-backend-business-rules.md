# ADR 0003 — Regras de negócio no backend

Data: 2026-10-17. Status: aceita.

## Decisão

O backend é a autoridade para regras de negócio, validação, persistência e execução
que independem da interface. O desktop envia intenções e observações do ambiente,
consome resultados e mantém estado de apresentação. Um cliente novo deve conseguir
usar o mesmo comportamento sem reimplementar políticas de produto.

| Responsabilidade | Proprietário |
|---|---|
| Histórico, marcação, conclusão, retomada, ordenação e retenção de 500 entradas | Backend: domínio de histórico, aplicação serializada e SQLite |
| Migração do histórico antigo no WebView | Desktop lê; backend valida e insere apenas entradas ausentes |
| Fontes, validação de torrent/magnet e recomendação de arquivo | Backend |
| Probe, compatibilidade, áudio, qualidade e conversão | Backend |
| Controle das transferências, exclusividade de reprodução, quota e limpeza | Backend |
| Credenciais, consultas, cache TMDB, imagens e limites de paginação | Backend |
| Limites permitidos do cache | Backend publica mínimo/máximo na API; UI usa esses valores |
| Formatação, filtros visuais, navegação, seleção do usuário e loading/retry | Desktop |
| Eventos de vídeo, buffers MSE, atalhos, fullscreen, janelas e arquivos locais | Desktop e shell nativo |

A validação local pode melhorar o feedback ou evitar leitura excessiva de um arquivo,
mas não substitui a validação no servidor. Limites do produto não devem ser definidos
independentemente no desktop. Por exemplo, a UI deixou de impor 1–1.000 GB quando o
backend admite 0,5–1.024 GB; o limite de 500 páginas também já vem do servidor.

## Histórico

`HistoryService` oferece leitura, atualização e importação autenticadas pelo mesmo
transporte Connect dos demais serviços. Atualizações normais recebem o horário do
servidor e comandos concorrentes compartilham um mutex. Gravação e retenção usam
transação SQLite. Metadados de título enviados pelo cliente são uma cópia para
apresentação, sem URLs de transmissão ou credenciais; identidades devem coincidir.

O desktop envia posição/duração e intenções de marcação. O servidor decide a conclusão
em 95%, protege o ponto anterior de um carregamento falho em zero, preserva escolhas
de reprodução ao marcar e retorna `resume_seconds`. Medir o tempo atual continua
sendo responsabilidade do elemento de vídeo.

A importação preserva datas e estados legados válidos e nunca substitui uma entrada
existente. Pode ser repetida depois de falhas parciais. O WebView remove sua cópia
somente após sucesso. Armazenamento local indisponível não impede ler o histórico do
servidor. O backend continua local ao dispositivo; esta mudança não implementa
sincronização remota. A migração SQL é automática ao abrir o diretório de dados.

## Verificação

Testes Rust em `core` cobrem conclusão, retomada, tempos inválidos e identidade
por episódio. A validação inicial com SQLite temporário também verificou reabertura
do banco, concorrência, importação repetida e retenção. O lint do repositório permite
testes Rust versionados somente em `core`; os exercícios de persistência foram
executados temporariamente. Testes TypeScript
cobrem envio ordenado de observações, espera por gravações, recuperação de falhas e
remoção do legado somente após confirmação. O player aguarda a fila antes de fechar.
