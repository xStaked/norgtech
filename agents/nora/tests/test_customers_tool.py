import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.customers import create_customer

SEGMENTS = [
    {"id": "seg-oro", "name": "Oro"},
    {"id": "seg-bronce", "name": "Bronce"},
]


def _run_create(segment_id=None, segments=SEGMENTS):
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=segments)
    fake_client.post = AsyncMock(return_value={"id": "cust_1", "legalName": "ACME"})

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        args = {
            "legal_name": "ACME SAS",
            "display_name": "ACME",
            "auth_token": "Bearer scoped",
        }
        if segment_id is not None:
            args["segment_id"] = segment_id
        result = asyncio.run(create_customer.ainvoke(args))
    return fake_client, result


def test_create_customer_defaults_to_bronce_when_no_segment_given():
    client, result = _run_create()
    _, payload = client.post.await_args.args
    assert payload["segmentId"] == "seg-bronce"
    assert "cust_1" in result


def test_create_customer_ignores_hallucinated_segment_id():
    # The LLM passes an id that does not exist -> we must not forward it.
    client, _ = _run_create(segment_id="made-up-id")
    _, payload = client.post.await_args.args
    assert payload["segmentId"] == "seg-bronce"


def test_create_customer_keeps_valid_segment_id():
    client, _ = _run_create(segment_id="seg-oro")
    _, payload = client.post.await_args.args
    assert payload["segmentId"] == "seg-oro"


def test_create_customer_errors_clearly_when_no_segments_exist():
    client, result = _run_create(segments=[])
    client.post.assert_not_awaited()
    assert "segmento" in result.lower()
