# Streak Day Rollover

Approved in chat on October 4, 2026: keep yesterday's streak while today is
unfinished, add today when its daily goal is met, and reset only after a missed
local calendar day ends.

Practice owns the shared calculation consumed by popup, Overview, and
Analytics. Count consecutive goal-met days starting today if its goal is met;
otherwise start yesterday. Stop at the first day below the goal. Only today
gets this grace period. Unique problems per local date and disabled-goal
semantics remain unchanged. No persistence, contract, or permission changes.

Regression proof must cover midnight, partial progress, reaching the goal,
an empty or partially completed missed day, and local month/year boundaries.
Human installed-extension smoke and screenshots remain required before review
or merge.
