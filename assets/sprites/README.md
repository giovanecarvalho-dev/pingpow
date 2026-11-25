# Sprites (Fase 3)

Coloque os PNGs nesta pasta com os nomes abaixo e rode:

```
python3 tools/sprites.py
```

O script gera o `assets/sprites.json` e avisa o que falta, o que está com tamanho errado e os nomes que ele não reconhece.
Arquivo que faltar não quebra nada: o jogo usa o desenho atual no lugar. Dá pra ir colocando aos poucos.

## Os 21 arquivos

`a` e `b` são as duas personagens (as mesmas do `PLAYERS` no `js/config.js`).

| Arquivo | Tamanho | O que é |
|---|---|---|
| `a_back_idle.png`, `b_back_idle.png` | 128×32 (4 quadros de 32×32) | de costas, parada (respirando) |
| `a_back_run.png`, `b_back_run.png` | 128×32 | de costas, correndo de lado |
| `a_back_swing.png`, `b_back_swing.png` | 128×32 | de costas, rebatendo (do começo ao fim do golpe) |
| `a_front_idle.png`, `b_front_idle.png` | 128×32 | de frente, parada |
| `a_front_run.png`, `b_front_run.png` | 128×32 | de frente, correndo de lado |
| `a_front_swing.png`, `b_front_swing.png` | 128×32 | de frente, rebatendo |
| `a_win.png`, `b_win.png` | 128×32 | de frente, comemorando (pulando, braços pra cima) |
| `a_portrait.png`, `b_portrait.png` | 64×64 | busto de frente, pro menu e a tela de vitória |
| `ball.png` | 8×8 | a bola |
| `icon_fire.png`, `icon_curve.png`, `icon_ice.png` | 16×16 | ícones dos poderes (smash, curva, congelar) |
| `arena_bg.png` | 270×480 | cenário em volta da mesa |

**Regras:**
- Fundo transparente (menos na arena) e pixel art puro, sem suavização. A mesma paleta nas duas.
- Animações em **tira horizontal**: quadros lado a lado, sem espaço entre eles.
- Pés da personagem na **última linha** do quadro, no meio. Se sobrar espaço embaixo, ajuste o `anchor` no `sprites.json`.
- **De costas** = a personagem de baixo (vista por trás, olhando pra mesa). **De frente** = a de cima (olhando pra câmera).
- A raquete é desenhada pelo jogo (é ela que vale pra colisão). A personagem pode segurar uma raquete pequena ou só esticar o braço.
- Na arena, a mesa ocupa x 25–245 e y 80–400, então o que ficar atrás dela não aparece. As faixas que sobram em cima e embaixo da tela pegam a cor da primeira e da última linha da arena.

## Como gerar no PixelLab

Os nomes dos botões podem mudar no site; a ideia é esta:

1. **Pose base:** crie a personagem usando a foto (em `referencias/`, fora do Git) como referência. Estilo chibi, 32×32, vista de cima com 4 direções. *South* = de frente; *north* = de costas.
2. **Animações a partir da pose base**, com 4 quadros cada: parada (respirando), correndo de lado, rebatida (golpe com a raquete) e comemoração.
3. **Consistência:** use o mesmo prompt de estilo nas duas e mude só o cabelo, o rosto e a roupa. A roupa pode usar a cor de cada uma no jogo (rosa `#ff5d8f` e azul `#4cc9f0`), ou essas cores mudam no `config.js` pra combinar com a arte.
4. **Limpeza:** acerte os detalhes no Aseprite, LibreSprite ou Piskel e exporte cada animação como tira de 1 linha (no Piskel: Exportar → PNG → spritesheet).
5. **Retrato** 64×64: busto de frente, no mesmo estilo.

Exemplo de prompt (adaptar): *cute chibi girl, long dark wavy hair, pink t-shirt and dark shorts, holding a ping pong paddle, pixel art, 32x32, top-down view, transparent background, clean outline, limited palette*.

Se o MCP do PixelLab for configurado no Claude Code, dá pra gerar direto por ele.

## Depois de colocar os arquivos

- `python3 tools/sprites.py` e conferir os avisos.
- Testar no servidor local com `?debug=1&bot=easy`.
- Ajustes:
  - posição da personagem em relação à raquete: `SPRITES.footY` no `js/config.js`;
  - velocidade das animações: `fps` no `sprites.json`;
  - corrida desenhada pra um lado só: `"flip": true` no `sprites.json` (o jogo espelha quando ela vai pra esquerda);
  - cores da mesa e da rede: `COLORS` no `js/config.js`.
