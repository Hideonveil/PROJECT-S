# Agent instructions

## Production access

For Production deployment, diagnostics, or container inspection, use the dedicated local SSH key:

```bash
ssh -i /Users/jasonhu/.ssh/jiyuan_hk_ed25519 ubuntu@124.156.175.247
```

Use this SSH path directly instead of depending on the Tencent Cloud browser terminal. Keep Production commands scoped to `/opt/jiyuan` and resolve the exact target before any destructive action.
