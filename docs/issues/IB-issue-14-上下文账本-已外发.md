> 存档：GitHub issue #14（closed，第一层上下文账本）线上正文，2026-10-19 拉取。外发前的英文源稿（本地草稿）已于 2026-10-20 随账本 effort 清理移除；本文件即该稿的外发定稿。


# Context ledger: attributing each request to the blocks that carried it

**Repository**: `Sui-IB/InternalBeyond-Mobile`
**Form**: mechanism write-up with a proposed capture layer. A reference implementation is attached separately (see the last section).
**Baseline**: upstream `main`, `index.html` blob `7ac4e15b`, 4,886,185 B (V3.1.0, commit `9ae7034a`)
**Verification environment**: Android Edge and Edge on Windows, local build, network-connected
**Provenance**: the build used here is byte-for-byte identical to the upstream `main` named above. Nothing was patched locally, and nothing on the remote was touched.

---

## Summary

Every turn reports a token total, and nothing says which part of the prompt carried it. A user who sees an input of around 35k tokens cannot tell whether the conversation history, the standing instruction blocks, the memory library, or the per-turn injections produced it. Each of those has a different lever, so the total alone gives nothing to act on. The largest lever, the history window, does not appear in the interface at all.

The context ledger records what each turn actually sent. It sits beside the assembly path in `genReply`, reads every block as the request is put together, and stores one snapshot per turn under stable ids. Nothing is recomputed, so no figure can drift from what went out. The blocks are reported in six fixed semantic groups, which turns the total into a split and keeps rows comparable across turns.

Two entry points show the result, both in containers that already exist: a local command in the helper sheet, and one row in the per-message detail sheet that expands in place. A draft reference implementation is attached separately, covering the first capture layer and both entry points. Group chat and character-initiated messages are specified in this issue and may follow as a separate submission.

<img width="2003" height="2160" alt="Image" src="https://github.com/user-attachments/assets/78e4cbdc-4a50-4ed5-b400-33d250417235" />
<img width="2003" height="2160" alt="Image" src="https://github.com/user-attachments/assets/4ca99012-dc74-4496-b7ad-3288ca51b30b" />
<img width="2160" height="13154" alt="Image" src="https://github.com/user-attachments/assets/16b7fc6e-d5b1-406d-bd81-ec45eab8bd0f" />
<img width="1990" height="2160" alt="Image" src="https://github.com/user-attachments/assets/c930a69b-6f4e-40c7-8a61-7f60fa2639d9" />

---

## 0. Where this sits, and what is visible today

The app already has a few diagnostics. A cache probe reports whether the prompt prefix was stable. An image probe reports what went out with pictures. A token dashboard reports the token total. The memory library holds long-term memories. The per-message detail sheet shows send time, character count, token usage, cache hit rate, and which memories were recalled.

None of them answers the question a user asks when a turn comes back large: **which part of the prompt was it?**

Today the question can only be answered by hand. The token dashboard reports the total input; the detail sheet reports the total. Neither breaks the total down. A user who sees an input of around 35k tokens cannot tell whether it came from the conversation history, the standing instruction blocks, the memory library, or the per-turn injections. Each of those has a different lever, so without the split there is nothing to act on.

This fills a gap in an existing series rather than opening a new direction. What follows describes the missing entry.

**Environment note**: all user-visible elements described below were checked on Android Edge and on Edge on Windows. Numbers quoted as measured come from the same build.

---

## 1. The mechanism as it stands, and the two gaps

### What is assembled, and where

`genReply` (around line 10655) assembles every request. It pushes the pieces into two arrays, `parts` for the system side and `tails` for the per-turn injections, plus a history block that `buildHist` produces separately. Before the request leaves, the code wraps `tails` in reverse order and folds it inside the final user message, delimited by `[系统参考资料]…【用户当前消息】` (around line 10779).

Two consequences shape any accounting of this:

- The tail injections are not separate messages. They sit inside the final user message, so counting them as messages would misreport the shape of the request.
- `_SYS_SPLIT_M` already splits `system` into two segments. It is a single control character, U+001E, defined around line 15964. `callAI` splits on the same marker (around line 10242) and sends two `system` blocks with independent `cache_control` (around line 10304). The two segments are the two cache breakpoints, the points where a cached prefix ends.
- A character-counting breakdown already exists, but nothing exposes it. Every block is counted as it passes and is then dropped.

### Gap one: no block-level attribution

The current view has three segments (system, history, final message with tails). That is a count, not an attribution, and it cannot answer "which part". The semantic split cannot be recovered afterwards either: once the arrays are joined, the blocks are separated by `\n\n` with no stable delimiters, so the flat string cannot be cut back into named pieces.

### Gap two: the history-size lever is not discoverable

`_apiHistSrcM` (around line 4954) reads the user's "context message count" setting as a target, not a hard cap. The beat `B` comes from `_winBeatM(keep)` (around line 9766); for the default `keep = 40` it is 40. `_winCutM` (around line 9771) then cuts along cache-friendly steps. With `keep = 40` the steps are:

- fresh (a new conversation with no recorded start): the first turn sends 40;
- summary off: everything below 80 is sent in full; from 80 upward, one cut every 40 (a sawtooth between 40 and 80);
- summary on: everything below 160 is sent in full; at 160 the window drops straight back to 40.

So the shape is not a straight line, and the break point is account-specific. With summary on, the window holds everything below `keep + 3B` and drops back to `keep` at that point. `B` comes from `_winBeatM(keep)`: for `keep = 999` that gives `B = 190`, so `999 + 3 × 190 = 1569`. On the accounts behind the measured figures that meant 160 for `keep = 40` and 1569 for `keep = 999`; these are examples, not constants. A user reading "context message count: 40" cannot know that 40 is a target, or where the cliff is. This is the single largest lever in the whole prompt, and the UI does not show it.

### Measured distribution (relative, from a real device)

Across 22 turns on a real device, the split shifts as a conversation grows:

| Phase | History share of total | Notes |
|---|---|---|
| 3-27 messages | 7.5% → 30.4% | system dominant (54-91% of the total) |
| 51-69 messages | 49.6% → 55.1% | history overtakes system from the first turn at 51 messages, then keeps climbing |

The crossover falls between the two sampled ranges, interpolated between them rather than measured at a single point. Below the lower range, the standing instruction blocks dominate; above the upper one, the conversation history does. The turning point is not visible from the token total, and the two ranges call for opposite actions: one shrinks when capabilities are turned off, the other when the context message count is lowered.

Figures for the instruction blocks come in three registers, and the distinction matters:

| Register | Value | Status |
|---|---|---|
| 15 static constants | ≈ 5,970 characters | **static**, counted from the source, independent of any account |
| plus roughly 9 dynamic blocks | ≈ 8,000 - 9,500 characters all told | **static**, same basis, dynamic parts enumerated separately |
| back-solved from the measured system total | ≈ 11,025 characters, about 84% of system | **derived**, relies on an unverified assumption about the tool block; the tool block (including any MCP server declarations) is not measured |

Only the first two rows are solid. The third is a subtraction with an assumption attached. The tool block (including any MCP server declarations) and the dynamic blocks not enumerated above are both unmeasured. The figure is stated here as what the ledger would measure directly, not as a result.

---

## 2. Capture points

The ledger only watches; it never recomputes. Every figure is taken at the moment the request is assembled, from the same values that are about to be sent. Nothing is recomputed, so no memory retrieval or embedding runs, and the numbers cannot drift from what actually went out.

**First layer: one-to-one conversation** (`genReply`, around line 10655; also covers the quiet channel, the co-reading room and the viewing room (观影室), which all route through it):

| Line | Block id | Captured from |
|---|---|---|
| 10691 | `dm.sys.persona` | `cfg.systemPrompt` |
| 10691 | `dm.sys.userctx` | `buildUserCtx` |
| 10701 | `dm.sys.am_instr` | memory-library instruction block |
| 10702 | `dm.sys.tools` | `buildToolsBlock()` |
| 10702 → 10757 | `dm.sys.protocols` | **length checkpoints**: joined length before and after this range |
| 10744 | `dm.hist.summary` | rolling summary text, when present |
| 10744 | `dm.hist.window` | the history window as a whole, plus message/image counts |
| 10757 | `dm.sys2.amcore` | archive core (档案核心) |
| 10757 | `dm.sys2.cold` | pinned cold-read entries |
| 10757 | `dm.sys2.chap` | sealed chapter (前情提要 / "封一章") |
| 10763 | `dm.tail.mem` | recalled memories |
| 10767 | `dm.tail.blogread` | blog-read injection (what the request to read a Blog post carries) |
| 10768 | `dm.tail.cal` | calendar |
| 10770 | `dm.tail.music` | now playing |
| 10771 | `dm.tail.beyond` | Beyond (social feed) |
| 10771 | `dm.tail.bxinbox` | Beyond mailbox |
| 10772 | `dm.tail.presence` | time away |
| 10773 | `dm.tail.gwfeed` | location / weather / payment lookups |
| 10782 | n/a | **snapshot closed** immediately before the request |

The protocol region needs a note. It is roughly fifteen small pushes with no individual names worth reporting; wrapping each one would touch the most code for the least gain. Two length checkpoints around the range recover it as one block, the right granularity for fixed boilerplate.

**Second layer: group chat** (`genReplyGroup`, around line 12209): approximately fifteen capture points, one snapshot per member, since each member's request differs.

**Third layer: character-initiated messages (主动开口)** (`_hbCtxFor` around line 18516, `_hbFireFor` around line 18531): few capture points; the snapshot attaches before the two message-write sites.

**Layers two and three are derived from reading the source. They have not been exercised on a device.**

### Alignment worth having

Because `system` is split on `_SYS_SPLIT_M`, the ledger's two system segments correspond one-to-one with the two cache breakpoints actually sent. "Which block cost this" and "which cached segment is this" become the same question, answered in one place.

### Timing

The history block is read **before** the reverse-order tail wrapping at lines 10774-10779, since that step rewrites the copy of the final user message. Reading it after that would attribute the tails to the wrong place.

### When capture fails

Every capture site is wrapped; a failure drops that block and nothing else. If the snapshot itself cannot be built, the request goes out unchanged and simply has no ledger entry. A message without a snapshot looks the way a message without a token row looks today. No retry, no separate write path.

### Empty is a value, not a failure

Each `add()` runs unconditionally, whether or not the feature switch behind the block is on. An assembled value that is the empty string is still recorded as `{id, 0}`, not skipped. Accounts run with different switches, so some pushes never execute. If an empty block were dropped, a user could not tell "this area is genuinely empty" (the protocol region in a quiet channel, for example) from "the instrumentation did not capture it".

The three states are separated when the report is rendered:

| State | How the report shows it |
|---|---|
| Genuinely empty in normal use, such as the protocol region in a quiet channel | not shown |
| Should be there but is empty, such as tool declarations with no MCP server configured, or the archive core with no standing entries | an explicit **0**, so that a switch which is on but has produced nothing is visible as such |
| Instrumentation failed | `{id, missed:1}`, "not counted this turn", so a tool problem is distinguishable from an empty block |

The memory block is the precedent: a retrieval hit of zero is a normal state for a turn that recalls nothing, and is reported as such instead of being treated as a capture gap (section 9).

---

## 3. Snapshot shape

```
ctxSnap {
  at, who          time, thread name
  total            this turn's input tokens as reported by the API (the measured figure)
  cr, cw           this turn's cache-read / cache-write as reported by the API (the per-turn header sums all three into the round's total input, with the cached read broken out in brackets; the cache-write figure is stored but not shown; total stays the input figure)
  totalChars       sum of the four segment lengths
  totalTok         sum of the four segments (estimated)
  sys1  { len, tok, blocks[] }   before _SYS_SPLIT_M
  sys2  { len, tok, blocks[] }   after _SYS_SPLIT_M
  hist  { len, tok, n, u, a, img, summary? }
  tails { len, tok, blocks[] }
}
block = { id, len, tok, head }
```

- `len` counts characters the same way the detail sheet's existing character count does, so an emoji counts as one. `head` keeps the first 150 characters.
- An empty value is recorded, not skipped: every `add()` runs whether or not the switch behind the block is on, and an empty string records as `{id, 0}`. The report then separates a genuinely empty block (not shown), one that should be there but is empty (an explicit 0), and a failed capture (`missed:1`, "not counted this turn"). See section 2.
- The measured total and the estimates are kept apart on purpose: `total` is what the service reported, the rest is estimation. The report says which is which.
- Image frames are counted as frames, not characters, and are not added into the token estimate. The report says so, rather than showing a misleading zero.
- Token figures are estimates. The existing estimator is reused (CJK at one token per character, everything else at one per four characters) instead of adding a browser-side tokenizer. It is accurate enough for this content, but it under-reads symbol-dense English blocks such as the protocol region, so the report marks those figures as approximate.

### Storage

Attached to the AI message record, beside `usage`, as its own field. No schema version bump: it attaches to an existing record and creates no new store.

Retention: every turn writes one, reads take the most recent N (six, matching the cache probe's display), and disk use is capped at 500 snapshots with the oldest cleared beyond that, the same pattern as the existing token detail ledger. The retention count is a read parameter, not a write-time decision, so it can change without a migration and nothing is discarded on the basis of an earlier guess.

**Not included in export backups**, numbers and preview text alike. The ledger is a local artefact that exists because the user asked for it; it should not travel to another device.

---

## 4. Semantic groups

Blocks are captured under stable ids. Grouping happens in the report layer, as an editable mapping. Renaming a group does not mean re-instrumenting anything.

The Covers column below describes what each group means semantically. It does not imply a one-to-one mapping to the independent capture blocks in section 2; for the actual capture points, see section 2.

| # | Group | Covers |
|---|---|---|
| 1 | Persona and profile | who the character is, who the user is, the site note, the persona lock |
| 2 | Features and rules | tool declarations and the capability protocol blocks |
| 3 | Prior history | the history already sent, the rolling summary, the sealed chapter |
| 4 | Memory and profile archive | standing memories, pinned entries, recalled entries, entries that surfaced this turn |
| 5 | Per-turn material | time, calendar, Blog, Beyond, Beyond mailbox, now playing, time away, lookup results, app notes |
| 6 | Other | anything not claimed above; empty in normal use |

**Fixed semantic order** (as listed), not sorted by size. The point is that the same row can be compared across turns. "Did that row grow since last week" is the question, and a row order that shifts every turn answers it badly.

Note that this is not the physical order of the assembled request: three of the groups span more than one segment. The order is semantic, and it stays fixed.

Two placement decisions worth stating, since they are judgement calls rather than facts:

- The memory-system instruction block goes with **features and rules**, not with the memory archive. It is a fixed instruction whose size follows the feature switches; the archive entries are content. Size behaviour is what the grouping is there to expose.
- In group chat, the rules block (which carries the room announcement) is grouped whole. It is assembled as one unit and cannot be split in the report layer. The announcement comes with it. That is a placement of convenience, and the report says the block is grouped whole.

The history window is recorded as one block with message counts attached, not message by message. At a hundred messages a per-message listing would be unreadable, and each message's opening line adds nothing to the question being asked. The name says *prior* on purpose: once a conversation runs past the context limit the window is truncated, so the ledger records the history already sent (the current window), not everything ever said.

---

## 5. Preview text

Each block stores its first 150 characters. In the report, most blocks show that opening text; a fixed set do not, and show size only.

The criterion is who might see it. Once this exists, a screenshot of the panel can end up in a group chat, and what that screenshot carries is someone else's memories, calendar, and the things their character said. An account holder is entitled to know their own data. That does not extend to deciding on someone else's behalf whether it becomes public.

So the preview is withheld from the archive core (private arrangements between the user and the character), the calendar block (event titles, notes, and health entries), and the Beyond feed and the Beyond mailbox (the character's own words about the user, plus live location). The fixed boilerplate blocks (protocol region, tool declarations, time stamp) are withheld for a different reason: their opening text identifies nothing, since they are identical every turn.

**For those blocks the ledger answers "how large", not "what it says".** The content itself is one tap away in the place it already lives: profile page, calendar, Beyond feed, Beyond mailbox. That is a division of views, not a restriction. The ledger is the aggregate view; those pages are the content view.

Preview text is stored but never exported, and it is the same text that was sent to the service that turn. Nothing is read from anywhere the request did not already reach.

---

## 6. Two ways to look at it

Both reuse containers that already exist. No new screen, no new sheet, no new visual vocabulary.

**Local command in the helper sheet (水水).** The sheet already carries `cache probe`, `image probe` and `settings list` as local commands, answered in place without an API call. The new one matches on `上下文(账本|日志)?` with an optional trailing question mark, matching how the cache probe accepts its short forms. It answers with a markdown list, one section per turn, separated by horizontal rules. That matches the shape and tone of the two existing probes, which matters more than any argument about tables in a narrow bubble.

Each turn's header carries the round's total input (what the API reported, cache included, with the cached read broken out in brackets) and the largest group. Each group line is compact: name, characters, tokens, share. A format legend sits under the opening line, and turns are separated by a blank line and a rule. Two short sections follow: what the group names mean, and what the figures do and do not represent.

**A row in the per-message detail sheet.** The sheet that opens on long-press already lists send time, character count, images, token usage and cache hit rate in a two-column grid. The ledger adds one row, shown only when the message carries a snapshot. The condition is the same one the existing token row uses. On a Chinese build the row reads:

```
上下文 · 4 组 · 占比最高 前序历史 ›
```

The number is the count of non-empty groups in that turn. The example shows 4 of the 6 groups with content.

Tapping the row expands a table in place: group, characters, tokens, share. Closing the sheet collapses it again.

The row carries no size figure: the token row above it already states the input, and a second number on a different basis would read as a contradiction. The row states structure instead.

---

## 7. Design decisions

**Why this is a separate module rather than an extension of the cache probe.** The cache probe works at the transport layer, comparing prefixes (the opening of the request) on the final message array that goes over the network. The ledger works at the assembly layer, where the named semantic blocks still exist. Merging them would lose one or the other. A single capture at the transport layer yields message-level segments (system whole, middle messages, final message), which is the count this proposal replaces. Deriving semantic blocks after the fact means re-assembling the string, and recomputation is exactly what this design avoids. Their retention needs differ too. The probe keeps its previous payload in memory and forgets it on refresh, because it only needs the previous turn. The ledger persists, because the question it answers is "what was that one last Tuesday". The only shared thing is the failure contract. **The cache probe is not modified at all.** Its fields and wording stay as they are.

**Why the row expands in place.** The long-press sheet is already a detail view: opening it is an explicit request to look at what this message carried. A row-level expansion is detail within detail, which is consistent with what the sheet is for. The exception is kept narrow on purpose. If inline expansion became general practice, every future diagnostic would cite it as precedent. So it stays confined to this sheet, and the helper's answers and the main chat surface still gain no collapsible elements.

**Why the desktop build is not covered.** The two builds assemble prompts through different code paths, and their UIs differ. This proposal covers the PWA build only.

**Why a fixed group order rather than sorted by size.** Sorted by size puts the largest group first, which sounds convenient. But the row order then changes from turn to turn, and cross-turn comparison, the reason to keep a ledger at all, becomes impossible. Every row carries its size and share regardless.

---

## 8. Not covered

Recorded so the scope is not read as broader than it is:

| Call | Why not |
|---|---|
| Manual "continue generating" | resends one message with a continuation instruction; it does not assemble the full context |
| Tool-loop follow-up calls | extend the same turn's system content |
| Automatic continuation | appends to the same turn; the round count is noted on the report instead |
| Letter writing | system plus a single task prompt, no history or memory assembly |
| Background utility calls (summarisation, memory screening, connection tests) | do not assemble user-visible context; those that route through the character-initiated path are picked up automatically |

---

## 9. Verification status

Stated per claim, because the registers differ.

- **Measured on device**: the group split, the distribution figures in section 1, the block sizes marked as measured in the instruction-block table in section 1, and the two entry points as described. 22 turns in total (12 from the initial sessions, 10 from a follow-up on a longer conversation).
- **From the source, not exercised on device**: the second and third capture layers; the group assignment for group chat and character-initiated messages.
- **Interpolated, not measured at a point**: the history crossover. It falls between the two sampled ranges (27 and 51 messages), so the crossing point is interpolated between them.
- **Three registers for the protocol region**, as set out in section 1. The derived figure carries an assumption and is labelled as such.
- **Not measured**: the two memory blocks (`recalled memories`, `pinned cold-read entries`). The mechanism has since been traced. `recalled memories` is injected only when a retrieval match fires (the recall rules are narrow), and `pinned cold-read entries` only carries pinned entries, so an empty block is the expected state for a turn that recalls nothing, not a capture gap. The cliff is account-specific. The cut point is `keep + 3B`, not a fixed message count, and it remains source-established but not observed at that point.
- **The estimator is an estimator.** Figures other than the API's own token count are approximate and marked as such in the report.

All findings come from an unmodified build.

---

## 10. What was not changed

The build used here is byte-for-byte identical to the upstream `main` named at the top: `index.html` blob `7ac4e15b`, sha256 identical on both sides. No local modifications were made, no database version was touched, and nothing on the remote was changed. Everything above is analysis; no code accompanies this issue.

---

## 11. The reference implementation

A draft reference implementation is attached separately. It covers the first capture layer (one-to-one, including quiet channels) and both entry points. Group chat and character-initiated messages are specified in the issue and may follow as a separate submission. The issue is the specification; the pull request is one working form of it.

This is a reference implementation meant for reading and comparison. The method can be adapted into the single-file update in whatever shape fits. The layers are laid out modularly, meaning **any single layer of this pull request can be adopted or taken on its own.**

## Correction

Two corrections from the author, recorded after the reference implementation was ported to v353-p (2026-10-19):

- **Beat B also depends on the provider and the cache TTL, not on `keep` alone.** Section 1 gives `B = 190` for `keep = 999`, which holds for most providers. With Anthropic's five-minute cache the same `keep = 999` gives `B = 210`. The cut point stays `keep + 3B`; only the value of B moves.
- **The 160-message cliff only applies while the rolling summary has not caught up.** Section 1 describes the summary-on case as "everything below 160 is sent in full; at 160 the window drops straight back to 40". That holds until the summary catches up with the conversation; once it has, the window settles differently. The cliff is a transient state, not the steady state.

refs #14
