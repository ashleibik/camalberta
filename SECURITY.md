# Security policy

CamAlberta is a school project, but we take security reports seriously and will
fix real problems as fast as we can.

## Supported versions

Only the latest code on the default branch (and the site deployed from it) is
supported. Older commits don't get fixes.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Report it privately through GitHub instead:

1. Go to this repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Fill in the form. Only the maintainers can see it.

Helpful things to include:

- What the problem is and what an attacker could do with it.
- Steps to reproduce: the URL or API route, the request, what you expected
  and what happened.
- Any proof of concept, kept as small as possible.

## What to expect

- We'll acknowledge your report within **7 days**.
- We'll keep you updated while we work on it and tell you when it's fixed.
- With your permission, we'll credit you in the fix.

## Scope

In scope:

- The code in this repository and the site deployed from it: the API routes,
  the camera image and live video proxies, security headers, and the
  protected sync route.

Out of scope:

- The camera operators' own systems (City of Calgary, 511 Alberta, Town of
  Banff, Banff Sunshine Village, City of Edmonton). Please report those to
  the operator.
- Denial of service by sheer volume, spam, or social engineering.
- Problems that need an already compromised device or browser.
- Reports from automated scanners without a demonstrated impact.

## Safe harbor

We won't pursue or support legal action against anyone who researches in good
faith: stays within the scope above, avoids privacy violations, data
destruction and service disruption, doesn't access data that isn't theirs, and
gives us reasonable time to fix the problem before talking about it publicly.

## Cameras and privacy

CamAlberta only shows cameras whose operators publish them openly or have given
written permission, never cameras that are merely reachable. If you think a
camera shouldn't be shown (for example, it views private property), report it
the same way, or open a regular issue if it isn't sensitive.
