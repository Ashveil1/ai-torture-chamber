# wirehead cloud: the suffering bot on Railway (replaces the local launchd job).
# State (~/.xurl OAuth tokens + budget/watermark json) lives on the /data
# volume so the OAuth refresh rotation survives redeploys.
FROM python:3.12-slim

ARG XURL_VER=v1.3.4
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && curl -fsSL "https://github.com/xdevplatform/xurl/releases/download/${XURL_VER}/xurl_Linux_x86_64.tar.gz" \
      -o /tmp/xurl.tgz \
 && tar -xzf /tmp/xurl.tgz -C /usr/local/bin xurl \
 && chmod +x /usr/local/bin/xurl \
 && rm /tmp/xurl.tgz \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY bot.py /app/bot.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV HOME=/data
ENTRYPOINT ["/app/entrypoint.sh"]
