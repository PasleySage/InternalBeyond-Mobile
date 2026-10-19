> 存档：GitHub issue #17（open，群聊＋主动开口第二层）线上正文，2026-10-19 拉取，**以线上为准**。外发前的英文源稿见 `.scratch/ib-ctx-ledger/draft-10-group-proactive.md`。

refs #14

# Context ledger: group chat and proactive layers

**Repository**: `Sui-IB/InternalBeyond-Mobile`  
**Form**: mechanism write-up with a proposed capture layer, extending the first layer specified in #14.  
**Baseline for this write-up**: upstream `main`, `index.html` blob `5d9b856c`, 4,899,525 B (V3.1.1, commit `7b425c6`). The first layer has since been ported to v353-p; every boundary below is given by function name rather than by position, so it survives the drift between builds.  
**Verification environment**: Android Edge and Edge on Windows, local build, network-connected  
**Provenance**: the build used here is byte-for-byte identical to the upstream `main` named above. Nothing was patched locally, and nothing on the remote was touched.

## Summary

The first layer of the context ledger, specified in #14, covers the one-to-one path and has been ported. This write-up adds the two paths that issue left for later: group chat, where each speaking member assembles and sends its own request, and character-initiated messages, which the background heartbeat triggers. The group path carries no tools block and the proactive path has no history window, so each path needs its own capture points rather than a shared one. The ledger stores sizes only and never content, and every entry point follows the conventions from your port: a guard at the entry, measurement by array index, no preview text, and no UI of its own.

## Group chat panel and report screenshots:

<img width="830" height="2112" alt="Image" src="https://github.com/user-attachments/assets/c7a2c1bb-4a69-4f0b-9607-0cfcb9e7edaa" />
<img width="1530" height="1379" alt="Image" src="https://github.com/user-attachments/assets/fc9dc735-f51f-48ba-ba94-a95e37e1b6c2" />
<img width="830" height="3611" alt="Image" src="https://github.com/user-attachments/assets/cb1b9c8f-344e-4f42-98e2-ab2827f13c35" />
<img width="889" height="1136" alt="Image" src="https://github.com/user-attachments/assets/ea39a8db-03e4-43ba-8e48-f26036935d92" />

## 0. What this adds

Two further capture layers: group chat (`genReplyGroup`) and character-initiated messages (`_hbCtxFor` and `_hbFireFor`). Everything the first layer established carries over unchanged: the six semantic groups, the snapshot shape, the registry, and the storage and retention rules. Where the ported first layer changed a convention, this proposal follows the ported version, collected in section 1.

## 1. Conventions carried over from the ported first layer

- **Entry guard.** Each entry point obtains its handle through a guard, so a missing ledger block cannot break request assembly.
- **Array-index measurement.** Tails are measured by array index and the original push lines are left untouched. No existing line is rewritten to carry a measurement.
- **No preview text.** Snapshots store id, length and tokens only. The first 150 characters are not stored.
- **Registry exclusion.** Per-layer registry entries stay out of export backups, the same as the ported first layer.
- **Block-sum invariant.** The captured blocks plus the measured wrap must account for the assembled total. A mismatch is a capture defect, not a rounding difference; this is the check the ported first layer was verified against.

## 2. Group chat (`genReplyGroup`)

**Capture unit.** One snapshot per speaking member per round. The speaker list is chosen before any assembly happens (director-mode scheduling, with silent-mode members skipped unless mentioned), and each member's request is assembled and sent inside the member loop. The snapshot therefore belongs to the member's request, not to the round.

**Boundary.** After the member's system content is complete and the tails have been folded into the final user message, before the request leaves. At that point the member's request is fully determined.

**System side.** The member's system content splits on the same `_SYS_SPLIT_M` marker, so the two segments line up with the two cache breakpoints again:

- before the marker: the member's persona and relationship line, the group rules block, the site note, the user context, the memory-system instruction, and the ask, sticker and Beyond instruction blocks when present;
- after the marker: the stable memory block, the sealed chapter (前情提要) when present, and the persona lock.

**The group rules block.** The rules, the room announcement (群公告) and the group-call note are assembled into one string per member, and the string carries the member's own name. It cannot be split in the report layer and is grouped whole, as already decided for the first layer.

**No tool declarations.** The group path assembles no tools block and no protocol region. The features-and-rules group in group chat covers the rules block, the memory-system instruction and the optional instruction blocks, and a group turn will read lower than a one-to-one turn on the same account. This is a property of the path, not a capture gap.

**History.** The window is derived inside the member loop. The code carries both a group-level context setting and per-member truncation, so the exact rule is a point to confirm during the port rather than a claim made here. The counts describe the window before the same-role collapsing step (`collapseSameRoleM`): total messages, messages from the user, messages from AI members, and image frames. This keeps the total accurate even when consecutive member replies are mapped to the user role. Other members' replies appear in the window as `[name]`-prefixed user-role messages, and voice messages contribute their transcript line.

**Shared versus per-member.** Chosen once per round: the speaker list, the group summary, the memory pool, and the shared query embedding. Per member: the history window, the system content, the tails, and the request itself. The location, weather and payment queue is consumed per member by friend id, so a round with several speakers splits the queue across them.

**Tails in the group path.** A reduced set compared with one-to-one: the time stamp; the idle and auto-chat notes when the round is one of those; the app note; the group summary tail; the memory block built for the speaking member; the Beyond tail; and the location, weather and payment queue. There is no calendar, now-playing, posts, blog-read or presence tail in this path.

**A boundary, not a capture point.** The last user message is read to pick speakers and to build the memory blocks, with voice messages contributing their transcript. That text is query construction, not context, and is not recorded.

**Write site.** The member's reply is written to the message store as its own record, carrying the member identity, and the snapshot attaches to that record. The abort and error paths can also write a partial reply; the snapshot follows whichever record is written.

## 3. Proactive messages (`_hbCtxFor` and `_hbFireFor`)

**Two assemblies, one request.** The proactive turn builds its prompt in two places. `_hbCtxFor` returns the system side and the tail: the persona, the no-persona note when there is no persona, the user context, the memory instruction and stable blocks, the persona lock, and a short tail holding the memory block and the Beyond tail. `_hbFireFor` builds the rest as a text block: the current time, the relationship, the recent messages, the calendar background, an optional phone-status glance, the quiet-minutes line, and an optional call invitation. The two are combined at the request.

**Capture unit and boundary.** One snapshot per fire, taken after `_hbCtxFor` returns and the text block is complete, before the request leaves. The proactive request is smaller than a one-to-one request: no tools block, no protocol region, and no history window in the `buildHist` sense, with the recent messages arriving as text inside the prompt.

**The two write sites.** The branch taken depends on the reply rather than on the request, so one snapshot serves both:

- the call-invitation branch writes a single call message;
- the text branch writes one to three short messages from one reply.

The snapshot attaches before each site, to whichever record is written. A fire can also be abandoned after the request has gone out, because a clash check runs before both writes; that snapshot has no message to attach to and is simply not referenced, the same way a message without a token row looks today.

**No panel row.** A proactive message renders no ledger row in its detail panel. Upstream attaches no usage to these messages, so the panel carries no token line. A lone ledger row beside the remaining rows reads as out of place, so only the panel row is withheld. The snapshot still travels with the message record and still appears in the report.

**Pacing interplay.** The proactive path is where the presence and quiet-minutes logic lives, including the beat that decides when a fire is due. The capture does not touch that logic; it only records what the fire sent.

## 4. Grouping and reporting

The six groups carry over unchanged. Two placements are specific to these layers:

- the group rules block goes with features and rules, grouped whole;
- the group summary and the sealed chapter go with prior history.

The idle and auto-chat notes are scheduling context rather than user-visible material; they can go with per-turn material or with other, whichever reads better in the report. No UI is proposed here. The entry points and the report surface follow whatever the first layer already uses, with one exception: the proactive layer renders no panel row, for the reason given in section 3.

## 5. Verification status

Both layers were derived from reading the source. Both have since been implemented in a separate local build and exercised on a device, network-connected, on Android Edge and Edge on Windows. The group layer ran end to end: per-member snapshots separated correctly across speakers, and the report and the panel row matched the first layer. The proactive layer ran with one deviation from this write-up, the withheld panel row described in section 3. No figures are offered. The acceptance test proposed for the port is the one the first layer was verified against: on the same seed data, two consecutive rounds produce byte-identical requests to the previous build, and the captured block sums match the two system blocks actually sent.

## 6. The reference implementation

A draft reference implementation is attached separately as [PR #16](https://github.com/Sui-IB/InternalBeyond-Mobile/pull/16). It covers both capture layers described in this write-up.
