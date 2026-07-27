import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.customers import (
    _normalize_tax_id,
    create_customer,
    search_customers,
    update_customer,
)
from src.tools.nestjs_client import NestJSAPIError

SEGMENTS = [
    {"id": "seg-oro", "name": "Oro"},
    {"id": "seg-bronce", "name": "Bronce"},
]

COMPANIES = [
    {"id": "co-nano", "name": "Nanonutrición"},
    {"id": "co-norg", "name": "Norgtech"},
]


def _run_create(segment_id=None, segments=SEGMENTS, company="Norgtech", companies=COMPANIES):
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(
        side_effect=lambda path, **kw: companies if path == "/companies" else segments
    )
    fake_client.post = AsyncMock(return_value={"id": "cust_1", "legalName": "ACME"})

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        args = {
            "legal_name": "ACME SAS",
            "display_name": "ACME",
            "auth_token": "Bearer scoped",
        }
        if segment_id is not None:
            args["segment_id"] = segment_id
        if company is not None:
            args["company"] = company
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


def test_create_customer_sends_company_id_resolved_from_name():
    client, _ = _run_create(company="norgtech")
    _, payload = client.post.await_args.args
    assert payload["companyId"] == "co-norg"


def test_create_customer_uses_the_only_company_when_none_given():
    client, _ = _run_create(company=None, companies=[COMPANIES[0]])
    _, payload = client.post.await_args.args
    assert payload["companyId"] == "co-nano"


def test_create_customer_asks_for_company_when_ambiguous():
    client, result = _run_create(company=None)
    client.post.assert_not_awaited()
    assert "Norgtech" in result and "Nanonutrición" in result


def _run_update(extra_args=None, patch_side_effect=None):
    fake_client = AsyncMock()
    if patch_side_effect is not None:
        fake_client.patch = AsyncMock(side_effect=patch_side_effect)
    else:
        fake_client.patch = AsyncMock(return_value={"id": "cust_1", "displayName": "ACME"})

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        args = {"customer_id": "cust_1", "auth_token": "Bearer scoped"}
        if extra_args:
            args.update(extra_args)
        result = asyncio.run(update_customer.ainvoke(args))
    return fake_client, result


def test_update_customer_patches_only_provided_fields():
    client, result = _run_update({"display_name": "Nuevo Nombre", "city": "Bogotá"})
    path, payload = client.patch.await_args.args
    assert path == "/customers/cust_1"
    assert payload == {"displayName": "Nuevo Nombre", "city": "Bogotá"}
    assert "cust_1" in result


def test_update_customer_normalizes_tax_id():
    client, _ = _run_update({"tax_id": "900123456"})
    _, payload = client.patch.await_args.args
    assert payload == {"taxId": "90012345-6"}


def test_update_customer_no_fields_does_not_call_api():
    client, result = _run_update()
    client.patch.assert_not_awaited()
    assert "ningún campo" in result.lower()


def test_update_customer_reports_api_error():
    err = NestJSAPIError(status_code=404, detail="Customer not found")
    client, result = _run_update({"display_name": "X"}, patch_side_effect=err)
    assert "error al actualizar cliente" in result.lower()
    assert "Customer not found" in result


def _run_search(query, customers):
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(return_value=customers)

    with patch("src.tools.customers.NestJSClient", return_value=fake_client):
        result = asyncio.run(
            search_customers.ainvoke({"query": query, "auth_token": "Bearer scoped"})
        )
    return fake_client, result


# El NIT es único global e ignora `active`: si la búsqueda no ve los inactivos,
# Nora dice "no existe" y al crearlo el API responde "ya existe con ese NIT".
def test_search_customers_includes_inactive_and_flags_them():
    client, result = _run_search(
        "Superagro",
        [{"id": "c1", "displayName": "SUPERAGRO SAS", "taxId": "900923429-1", "active": False}],
    )
    _, kwargs = client.get.await_args
    assert kwargs["params"]["includeInactive"] == "true"
    assert '"activo": false' in result


def test_normalize_tax_id_handles_dotted_input():
    # El vendedor lo dicta "9.009.234.291"; en base está "900923429-1".
    assert _normalize_tax_id("9.009.234.291") == "900923429-1"
    assert _normalize_tax_id("900923429-1") == "900923429-1"
    assert _normalize_tax_id("9009234291") == "900923429-1"
    assert _normalize_tax_id(None) is None


def test_update_customer_can_reactivate():
    client, _ = _run_update({"active": True})
    _, payload = client.patch.await_args.args
    assert payload == {"active": True}
