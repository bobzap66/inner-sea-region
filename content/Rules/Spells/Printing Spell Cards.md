---
title: Printing Spell Cards
type: guide
category_path:
  - Spells
---

# Printing Spell Cards

There are a couple of useful sites for making printable PF2e spell cards.

## PF2Easy Spellbook

- [PF2Easy Spellbook](https://pf2easy.com/spellbook/) — Core Rulebook-era spells
- [PF2Easy Spellbook 2023](https://pf2easy.com/spellbook/?year=2023) — Remastered Player Core spells

The two versions work the same way.

![[printing-spell-cards-spellbook-1.png]]

The blue **How To** button opens a detailed guide and links to a video demonstrating the site.

Create your spellbook, then click **Print**. This opens a new tab containing your cards.

Open your browser's developer tools with `Ctrl+Shift+I`, select **Console**, and paste the JavaScript below. Your browser may warn you about pasting code into the console and require you to type a confirmation before it allows input. Follow the browser's prompt before continuing.

![[printing-spell-cards-spellbook-2.png]]

```javascript
var script_one_time = document.createElement('script');
script_one_time.src = "https://cdn.jsdelivr.net/gh/arthurvanpassel/pf2easy-spell-cards@latest/one-time-insert";
document.querySelector('head').appendChild(script_one_time);
```

![[printing-spell-cards-screenshot-2024-04-02-183148.png]]

The same script is also available on [Pastebin](https://pastebin.com/GBZ4gr6A).

Print the cards normally. You may need to adjust your printer margins so a card does not split across two pages.

## Pathfinder Cards

For spells that are not available through PF2Easy, use [Pathfinder Cards](https://pathfinder-cards.vercel.app/).

This site requires you to enter the spell information manually. Use Archives of Nethys as the rules reference rather than copying from an internal spell article.

Create a project and enter the spell information into the fields:

- **Name:** Spell name.
- **Traits:** Separate traits with commas so each appears in its own box.
- **Actions:** Use `(A)` for one action, `(AA)` for two actions, `(AAA)` for three actions, `(R)` for a reaction, and `(F)` for a free action.
- **Type:** Enter `Spell`.
- **Level:** Enter the spell's rank.
- **Description:** Enter the spell's rules text from your chosen rules reference.

If you have more cards to create, click **Add Card** and repeat the process.

The site has historically behaved inconsistently when storing more than three cards at once. A reliable approach is to create three cards, switch to **Print View**, print them, then delete those cards or start a new project before creating more. Setting print scale to about **88%** produces cards close to standard trading-card size.

## Related

- [[Rules/Spells/Spells|Spells]]
