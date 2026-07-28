"""AI-11: get_customer_summary compone un resumen 360 a partir de endpoints de
lectura que YA existen (customer basics + cartera + visitas + oportunidades).
No debe crear endpoints nuevos ni mutar datos."""
import asyncio
from unittest.mock import AsyncMock, patch

from src.tools.customers import get_customer_summary
from src.tools.nestjs_client import NestJSAPIError


def _make_client():
    fake_client = AsyncMock()

    async def _get(path, params=None):
        if path == "/customers/cust-1":
            return {
                "id": "cust-1",
                "displayName": "Ferretería El Martillo",
                "legalName": "Ferretería El Martillo SAS",
                "taxId": "900123456-7",
                "city": "Bogotá",
                "phone": "3001112233",
                "segment": {"name": "Bronce"},
            }
        if path == "/invoices/summary":
            assert params == {"customerId": "cust-1"}
            return {"totalBalance": 1500000}
        if path == "/invoices/overdue":
            return [
                {"invoiceNumber": "F-1", "customer": {"id": "cust-1"}},
                {"invoiceNumber": "F-2", "customer": {"id": "otro"}},
            ]
        if path == "/visits":
            assert params == {"customerId": "cust-1"}
            return [
                {"id": "v1", "scheduledAt": "2026-06-29T12:00:00", "summary": "Interesados en equipos"},
            ]
        if path == "/opportunities":
            assert params == {"customerId": "cust-1"}
            return [
                {"id": "o1", "title": "Suministro anual", "stage": "cotizacion"},
            ]
        raise AssertionError(f"Endpoint inesperado: {path}")

    fake_client.get = AsyncMock(side_effect=_get)
    return fake_client


def _run(client):
    with patch("src.tools.customers.NestJSClient", return_value=client):
        return asyncio.run(
            get_customer_summary.ainvoke(
                {"customer_id": "cust-1", "auth_token": "Bearer scoped"}
            )
        )


def test_summary_composes_all_read_endpoints():
    client = _make_client()
    _run(client)
    called = {c.args[0] for c in client.get.await_args_list}
    # Debe leer los cuatro dominios desde endpoints existentes.
    assert "/customers/cust-1" in called
    assert "/invoices/summary" in called
    assert "/visits" in called
    assert "/opportunities" in called


def test_summary_returns_readable_spanish_string():
    result = _run(_make_client())
    assert "Ferretería El Martillo" in result
    # Cartera (saldo), visita reciente y oportunidad deben aparecer resumidos.
    assert "1.500.000" in result
    assert "1 factura(s) vencida(s)" in result
    assert "Interesados en equipos" in result
    assert "Suministro anual" in result


def test_summary_only_reads_never_writes():
    client = _make_client()
    _run(client)
    client.post.assert_not_awaited()
    client.patch.assert_not_awaited()
    client.delete.assert_not_awaited()


def test_summary_survives_one_failing_endpoint():
    """Las 5 lecturas van en paralelo (asyncio.gather): que una falle no puede
    cancelar las otras ni tumbar el resumen."""
    client = _make_client()
    ok_get = client.get.side_effect

    async def _get(path, params=None):
        if path == "/visits":
            raise NestJSAPIError(500, "visits caida")
        return await ok_get(path, params=params)

    client.get = AsyncMock(side_effect=_get)
    result = _run(client)
    assert "No pude leer las visitas" in result
    # El resto del resumen sigue completo.
    assert "Ferretería El Martillo" in result
    assert "1.500.000" in result
    assert "Suministro anual" in result


def test_summary_handles_customer_not_found():
    fake_client = AsyncMock()
    fake_client.get = AsyncMock(side_effect=NestJSAPIError(404, "Customer not found"))
    result = _run(fake_client)
    assert "error al obtener el resumen del cliente" in result.lower()
    assert "Customer not found" in result
