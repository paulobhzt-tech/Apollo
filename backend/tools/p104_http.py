"""Owned TLS test client lifecycle; credentials are never logged."""
from contextlib import contextmanager
import httpx


@contextmanager
def authenticated_client(owner, *, verify, base_url='https://127.0.0.1:18443', transport=None):
    with httpx.Client(base_url=base_url,verify=verify,trust_env=False,timeout=45,transport=transport,
                      headers={'Host':'homolog.apollo-pdv.com','Origin':'https://homolog.apollo-pdv.com'}) as client:
        response=client.post('/api/auth/login',json={'username':owner['username'],'password':owner['password']})
        assert response.status_code==200
        assert all(s in response.headers['set-cookie'].lower() for s in ['secure','httponly','samesite=lax'])
        yield client
