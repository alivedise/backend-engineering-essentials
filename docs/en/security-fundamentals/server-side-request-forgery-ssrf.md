---
id: 2015
title: Server-Side Request Forgery (SSRF)
state: draft
slug: server-side-request-forgery-ssrf
---

# [BEE-2015] Server-Side Request Forgery (SSRF)

:::info
SSRF tricks a server into issuing HTTP requests on behalf of an attacker — bypassing firewalls, reaching internal services, and exfiltrating cloud credentials that the attacker can never reach directly.
:::

## Context

Server-Side Request Forgery became a defining vulnerability of the cloud era. The attack predates cloud computing — early instances appeared in internal network scanners and XML parsers fetching remote DTDs — but its severity escalated sharply when cloud providers introduced instance metadata services reachable via the predictable, unroutable IP `169.254.169.254`. Any server that fetches a user-supplied URL and runs inside a cloud VM can be turned into a proxy for stealing the IAM credentials that control the entire cloud account.

The canonical demonstration of the real-world cost is the Capital One breach of 2019. An attacker exploited a misconfigured WAF rule to issue a GET request to `http://169.254.169.254/latest/meta-data/iam/security-credentials/` from within a Capital One EC2 instance. The metadata service returned temporary IAM credentials. The attacker used those credentials to list and download data from over 100 S3 buckets, exposing approximately 106 million customer records. The incident resulted in a $80 million OCC fine. The root cause was a combination of SSRF vulnerability and an IAM role with excessive S3 permissions — neither alone was sufficient, but both together were catastrophic.

OWASP added SSRF as a standalone entry — A10 in the OWASP Top 10:2021 — specifically because of its growing incidence in cloud-hosted applications, with 385 CVEs mapped to the category. The OWASP API Security Top 10:2023 lists it as API7, noting that containerized and microservice architectures increase exposure because they typically run in cloud environments with metadata endpoints and internal service meshes that present attractive targets.

## Attack Mechanics

The core mechanism: a backend service receives a URL from a client, fetches it server-side, and returns or processes the response. The attacker controls the URL.

**Three attack goals:**

**1. Cloud credential theft via metadata service.** AWS EC2, GCP, and Azure all expose instance metadata at `169.254.169.254` (a link-local address unreachable from outside the host). On AWS with IMDSv1, a GET request to `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>` returns a JSON document with `AccessKeyId`, `SecretAccessKey`, and `Token` — temporary credentials valid for hours. With those credentials, an attacker can perform any action the role permits.

**2. Internal service enumeration and exploitation.** An application running in a VPC can reach any other service in the same network. An attacker can use SSRF to port-scan (`http://10.0.0.1:6379/` for Redis, `http://10.0.0.1:9200/` for Elasticsearch), access admin interfaces not exposed to the internet, or trigger unauthenticated API calls on internal services that trust traffic originating from within the VPC.

**3. Blind SSRF for out-of-band data exfiltration.** When the application does not return the fetched response to the caller, the attacker cannot read the content directly but can still infer information. DNS lookups triggered by the server reveal which domains resolve from the server's network. Timing differences reveal whether an internal port is open or closed. Out-of-band analysis servers (Burp Collaborator, Interactsh) receive callbacks that confirm connectivity without the attacker ever seeing the HTTP response body.

**Bypass techniques backend engineers must know about:**

- **Alternate encodings:** `http://0177.0.0.1/` (octal), `http://0x7f000001/` (hex), `http://2130706433/` (decimal) all resolve to `127.0.0.1`.
- **IPv6 loopback:** `http://[::1]/` bypasses simple string comparisons for "127".
- **DNS rebinding:** The attacker registers a domain that initially resolves to a legitimate IP (passing validation), then changes the DNS record to `127.0.0.1` before the application makes the actual connection. If validation and connection use separate DNS resolutions, the TOCTOU gap is exploitable.
- **Open redirect chaining:** The application fetches a URL, follows a 301/302 redirect controlled by the attacker, and ends up at `http://169.254.169.254/` after the redirect.

## Best Practices

### Network-Layer Defenses

**MUST enforce IMDSv2 on all AWS EC2 instances and EKS nodes.** IMDSv2 requires a session-oriented PUT request to obtain a time-limited token before any metadata read:

```bash
# IMDSv1 — vulnerable: any SSRF can fetch credentials
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role

# IMDSv2 — requires a PUT to obtain a token first
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role
```

The PUT + custom header requirement means a browser or server-side `GET` issued via SSRF cannot obtain the token. Enforce IMDSv2 by setting `HttpTokens: required` in your launch configuration. Disabling IMDSv1 entirely should be the default for all new infrastructure.

GCP enforces an equivalent protection by requiring the `Metadata-Flavor: Google` request header — a header that cannot be set by cross-origin browser requests and is easy to mandate in server-side clients.

**MUST block outbound requests from application servers to RFC 1918 private address ranges and link-local ranges** at the network layer (security group egress rules, VPC firewall policies). Key ranges to block:
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` — RFC 1918 private
- `169.254.0.0/16` — link-local (metadata services)
- `127.0.0.0/8`, `::1/128` — loopback
- `100.64.0.0/10` — IANA Shared Address Space (RFC 6598)

Network-layer blocking is defense-in-depth: it limits blast radius even when application-level validation fails.

### Application-Layer Defenses

**MUST use an allowlist for user-supplied URLs, not a blocklist.** Blocklists are inherently incomplete — new encoding tricks, IPv6 variants, and future private ranges will bypass them. An allowlist of approved domains or IP prefixes cannot be bypassed by encoding:

```python
from urllib.parse import urlparse
import ipaddress
import socket

ALLOWED_SCHEMES = {"https"}
ALLOWED_DOMAINS = {"api.trusted-partner.com", "s3.amazonaws.com"}

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        return False
    if parsed.hostname not in ALLOWED_DOMAINS:
        return False
    # Resolve and verify the IP is not private
    try:
        addr = ipaddress.ip_address(socket.getaddrinfo(parsed.hostname, None)[0][4][0])
    except Exception:
        return False
    if (addr.is_private or addr.is_loopback or
            addr.is_link_local or addr.is_reserved):
        return False
    return True
```

**MUST resolve the URL once and verify the IP before making the actual connection — do not resolve again at connection time.** A DNS rebinding attack exploits the gap between a validation-time DNS resolution (which returns a legitimate IP) and a connection-time resolution (which returns `127.0.0.1`). The mitigation is to resolve once, validate the IP, then pass the resolved IP address directly to the HTTP client rather than the hostname.

**MUST disable HTTP redirect following** in HTTP clients used for user-supplied URLs, or validate each redirect target against the allowlist before following it. An open redirect on a trusted domain can chain into a metadata endpoint fetch.

**SHOULD run URL-fetching workers in a separate network segment** with egress restricted to the allowlist. An application server that renders webhook payloads does not need the same network access as a server that handles customer authentication.

**SHOULD apply the principle of least privilege to IAM roles.** SSRF in the Capital One case was sufficient to compromise 100M records because the role had broad S3 ListBucket and GetObject permissions. An SSRF vulnerability reaching a metadata endpoint with a role that can only write to one specific S3 path is a dramatically smaller incident.

### Blind SSRF Detection

**SHOULD instrument outbound requests from application servers** with structured logs that include the destination URL, resolved IP, and response code. Anomalous patterns — requests to `169.254.*`, high rates to internal subnets, unexpected DNS lookups — are detectable before they become incidents.

In security testing, use out-of-band callback infrastructure (Burp Collaborator, Interactsh) to detect blind SSRF: inject a unique domain as the URL value, then check whether the server issues a DNS lookup or HTTP request to that domain. A DNS callback confirms the application attempted to resolve the attacker-supplied hostname even if no HTTP response was returned to the client.

## Visual

```mermaid
sequenceDiagram
    participant A as Attacker
    participant S as Application Server
    participant M as Cloud Metadata<br/>169.254.169.254
    participant R as Attacker<br/>Controlled Server

    A->>S: POST /import?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/app-role
    S->>M: GET /latest/meta-data/iam/...
    M-->>S: {"AccessKeyId":"ASIA...","SecretAccessKey":"...","Token":"..."}
    S-->>A: (returns credentials in response or logs)
    A->>R: aws s3 ls --profile stolen

    style A fill:#c0392b,color:#fff
    style S fill:#e67e22,color:#fff
    style M fill:#1d3557,color:#fff
    style R fill:#c0392b,color:#fff
```

## Example

A common SSRF entry point is a URL preview or webhook registration endpoint:

```python
# VULNERABLE: directly fetches user-supplied URL
import httpx

@app.post("/webhooks/test")
async def test_webhook(url: str):
    # Attacker supplies: http://169.254.169.254/latest/meta-data/iam/security-credentials/prod-role
    response = httpx.get(url, follow_redirects=True)
    return {"status": response.status_code, "body": response.text}
```

Hardened version:

```python
import httpx
import ipaddress
import socket
from urllib.parse import urlparse

ALLOWED_WEBHOOK_HOSTS = {"hooks.slack.com", "api.pagerduty.com"}

def resolve_and_validate(hostname: str) -> str:
    """Resolve hostname once; raise if IP is private/loopback/link-local."""
    try:
        ip_str = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
    except socket.gaierror:
        raise ValueError(f"Cannot resolve {hostname}")
    addr = ipaddress.IPv4Address(ip_str)
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        raise ValueError(f"Resolved IP {ip_str} is in a blocked range")
    return ip_str

@app.post("/webhooks/test")
async def test_webhook(url: str):
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(400, "Only HTTPS webhooks are allowed")
    if parsed.hostname not in ALLOWED_WEBHOOK_HOSTS:
        raise HTTPException(400, "Webhook host not in allowlist")
    resolved_ip = resolve_and_validate(parsed.hostname)
    # Pass resolved IP to avoid second DNS resolution at connection time
    transport = httpx.HTTPTransport()
    async with httpx.AsyncClient(transport=transport) as client:
        response = await client.post(
            url,
            headers={"Host": parsed.hostname},
            timeout=5.0,
            follow_redirects=False,  # do NOT follow redirects
        )
    return {"status": response.status_code}
```

For AWS infrastructure, enforce IMDSv2 at the CloudFormation layer so no application change is required:

```yaml
# CloudFormation: enforce IMDSv2 on all EC2 instances
LaunchTemplate:
  Type: AWS::EC2::LaunchTemplate
  Properties:
    LaunchTemplateData:
      MetadataOptions:
        HttpTokens: required          # disables IMDSv1
        HttpPutResponseHopLimit: 1    # prevents containers from reaching IMDS
        HttpEndpoint: enabled
```

Setting `HttpPutResponseHopLimit: 1` means the IMDSv2 token PUT cannot hop across a network bridge — containers inside the instance cannot reach the metadata endpoint even with IMDSv2.

## Related BEEs

- [BEE-2001](owasp-top-10-for-backend.md) -- OWASP Top 10 for Backend: SSRF is A10:2021 in the OWASP Top 10
- [BEE-2008](owasp-api-security-top-10.md) -- OWASP API Security Top 10: SSRF is API7:2023 with specific API attack vectors
- [BEE-2009](http-security-headers.md) -- HTTP Security Headers: Content-Security-Policy restricts client-side fetches but does not prevent server-side SSRF
- [BEE-2003](secrets-management.md) -- Secrets Management: SSRF targeting cloud metadata endpoints steals dynamically issued secrets; proper rotation limits the window of exposure
- [BEE-2013](cross-site-request-forgery-csrf-and-defense-patterns.md) -- CSRF: both CSRF and SSRF involve forged requests; CSRF forges requests from a user's browser, SSRF forges requests from the server

## References

- [OWASP Top 10:2021 — A10:2021 Server-Side Request Forgery — owasp.org](https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_(SSRF)/)
- [OWASP API Security Top 10:2023 — API7:2023 Server Side Request Forgery — owasp.org](https://owasp.org/API-Security/editions/2023/en/0xa7-server-side-request-forgery/)
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet — cheatsheetseries.owasp.org](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PortSwigger Web Security Academy. Server-side request forgery (SSRF) — portswigger.net](https://portswigger.net/web-security/ssrf)
- [PortSwigger Web Security Academy. Blind SSRF vulnerabilities — portswigger.net](https://portswigger.net/web-security/ssrf/blind)
- [Brian Krebs. What We Can Learn from the Capital One Hack — krebsonsecurity.com, August 2019](https://krebsonsecurity.com/2019/08/what-we-can-learn-from-the-capital-one-hack/)
- [AWS. Get the full benefits of IMDSv2 and disable IMDSv1 across your AWS infrastructure — aws.amazon.com](https://aws.amazon.com/blogs/security/get-the-full-benefits-of-imdsv2-and-disable-imdsv1-across-your-aws-infrastructure/)
- [AWS. Configure the instance metadata service — docs.aws.amazon.com](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html)
- [IETF RFC 1918. Address Allocation for Private Internets — datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc1918)
- [IETF RFC 3927. Dynamic Configuration of IPv4 Link-Local Addresses — datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc3927)
- [OWASP Testing Guide. Testing for SSRF — owasp.org](https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/19-Testing_for_Server-Side_Request_Forgery)
