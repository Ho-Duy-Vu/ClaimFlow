import asyncio
import io

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


def _make_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name="us-east-1",
    )


async def ensure_bucket() -> None:
    client = _make_client()
    bucket = settings.AWS_BUCKET_NAME

    def _run():
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError:
            client.create_bucket(Bucket=bucket)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)


async def upload_file(file_bytes: bytes, file_key: str, content_type: str) -> None:
    client = _make_client()
    bucket = settings.AWS_BUCKET_NAME
    data = io.BytesIO(file_bytes)

    def _run():
        client.upload_fileobj(
            data, bucket, file_key, ExtraArgs={"ContentType": content_type}
        )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)


def get_presigned_url(file_key: str, expires_in: int = 3600) -> str:
    client = _make_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_BUCKET_NAME, "Key": file_key},
        ExpiresIn=expires_in,
    )


async def download_file(file_key: str) -> bytes:
    client = _make_client()
    bucket = settings.AWS_BUCKET_NAME
    buf = io.BytesIO()

    def _run():
        client.download_fileobj(bucket, file_key, buf)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)
    return buf.getvalue()


async def delete_file(file_key: str) -> None:
    client = _make_client()
    bucket = settings.AWS_BUCKET_NAME

    def _run():
        client.delete_object(Bucket=bucket, Key=file_key)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)
