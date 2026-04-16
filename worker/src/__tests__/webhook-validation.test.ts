import { describe, it, expect } from "vitest";
import { validateWebhookURLAndGetIPs } from "@langfuse/shared/src/server";

describe("Webhook URL Validation", () => {
  describe("validateWebhookURL", () => {
    it("should accept valid public HTTPS URLs", async () => {
      await expect(
        validateWebhookURLAndGetIPs("https://httpbin.org/post"),
      ).resolves.not.toThrow();
    });

    it("should accept valid public HTTP URLs", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://httpbin.org/post"),
      ).resolves.not.toThrow();
    });

    it("should reject invalid URL syntax", async () => {
      await expect(validateWebhookURLAndGetIPs("not-a-url")).rejects.toThrow(
        "Invalid URL syntax",
      );
    });

    it("should reject non-HTTP/HTTPS protocols", async () => {
      await expect(
        validateWebhookURLAndGetIPs("ftp://example.com"),
      ).rejects.toThrow("Only HTTP and HTTPS protocols are allowed");
      await expect(
        validateWebhookURLAndGetIPs("file:///etc/passwd"),
      ).rejects.toThrow("Only HTTP and HTTPS protocols are allowed");
    });

    it("should reject disallowed ports", async () => {
      await expect(
        validateWebhookURLAndGetIPs("https://example.com:8080/hook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
      await expect(
        validateWebhookURLAndGetIPs("http://example.com:3000/hook"),
      ).rejects.toThrow("Only ports 80 and 443 are allowed");
    });

    it("should allow standard ports", async () => {
      await expect(
        validateWebhookURLAndGetIPs("https://httpbin.org:443/post"),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURLAndGetIPs("http://httpbin.org:80/post"),
      ).resolves.not.toThrow();
    });

    it("should reject localhost URLs", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://localhost/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURLAndGetIPs("http://test.localhost/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      // Generic error message without IP address
      await expect(
        validateWebhookURLAndGetIPs("https://127.0.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
      await expect(
        validateWebhookURLAndGetIPs("http://[::1]/hook"),
      ).rejects.toThrow(/Blocked IP address detected|ipaddr:/);
    });

    it("should reject private network URLs", async () => {
      // Generic error messages without exposing IP addresses
      await expect(
        validateWebhookURLAndGetIPs("http://192.168.1.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
      await expect(
        validateWebhookURLAndGetIPs("http://10.0.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
      await expect(
        validateWebhookURLAndGetIPs("http://172.16.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should reject link-local addresses", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://169.254.169.254/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject multicast addresses", async () => {
      // Generic error message without exposing IP address
      await expect(
        validateWebhookURLAndGetIPs("http://224.0.0.1/hook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should reject broadcast addresses", async () => {
      // Generic error message without exposing IP address
      await expect(
        validateWebhookURLAndGetIPs("http://255.255.255.255/hook"),
      ).rejects.toThrow("Blocked IP address detected");
    });

    it("should reject IPv6 private addresses", async () => {
      // Generic error messages without exposing IP addresses
      await expect(
        validateWebhookURLAndGetIPs("http://[fc00::1]/hook"),
      ).rejects.toThrow(/Blocked IP address detected|ipaddr:/);
      await expect(
        validateWebhookURLAndGetIPs("http://[fe80::1]/hook"),
      ).rejects.toThrow(/Blocked IP address detected|ipaddr:/);
    });

    it("should handle DNS resolution failures gracefully", async () => {
      await expect(
        validateWebhookURLAndGetIPs(
          "https://this-domain-definitely-does-not-exist-12345.com/hook",
        ),
      ).rejects.toThrow("DNS lookup failed");
    });

    it("should reject URL-encoded localhost bypass attempts", async () => {
      // %6C%6F%63%61%6C%68%6F%73%74 decodes to "localhost" but fails on port check first
      await expect(
        validateWebhookURLAndGetIPs("http://%6C%6F%63%61%6C%68%6F%73%74/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject internal/intranet hostnames", async () => {
      // Note: "internal.company.com" would require DNS resolution which can timeout
      // Using domains that match blocked patterns directly for faster tests
      await expect(
        validateWebhookURLAndGetIPs("http://service.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURLAndGetIPs("http://app.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURLAndGetIPs("http://intranet/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject docker internal hostnames", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://host.docker.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURLAndGetIPs("http://gateway.docker.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
    });

    it("should reject cloud metadata endpoints", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://metadata.google.internal/hook"),
      ).rejects.toThrow("Blocked hostname detected");
      await expect(
        validateWebhookURLAndGetIPs("http://[fd00:ec2::254]/hook"),
      ).rejects.toThrow(
        /Blocked hostname detected|Blocked IP address detected/,
      );
    });

    it("should handle malformed URL encoding", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://exam%ple.com/hook"),
      ).rejects.toThrow(/Invalid URL encoding|Invalid URL syntax/);
    });

    it("should allow local hostname, if it is included in the whitelist", async () => {
      await expect(
        validateWebhookURLAndGetIPs("http://internal.company.com/hook", {
          hosts: ["internal.company.com"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURLAndGetIPs("http://app.internal/hook", {
          hosts: ["app.internal"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
      await expect(
        validateWebhookURLAndGetIPs("http://intranet/hook", {
          hosts: ["intranet"],
          ips: [],
          ip_ranges: [],
        }),
      ).resolves.not.toThrow();
    });
  });
});
