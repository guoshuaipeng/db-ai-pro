#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenAPI 积分接口测试脚本
使用 HMAC-SHA256 签名验证
"""

import hmac
import hashlib
import base64
import time
import random
import requests
import json


class OpenApiClient:
    """OpenAPI客户端"""

    def __init__(self, base_url, access_key, secret_key):
        """
        初始化客户端

        Args:
            base_url: API基础URL，如 http://localhost:8080
            access_key: 访问密钥
            secret_key: 签名密钥
        """
        self.base_url = base_url.rstrip('/')
        self.access_key = access_key
        self.secret_key = secret_key

    def _generate_signature(self, params):
        """
        生成HMAC-SHA256签名

        Args:
            params: 参数字典（包含公共参数和业务参数）

        Returns:
            Base64编码的签名字符串
        """
        # 1. 参数排序（ASCII升序）
        sorted_params = sorted(params.items())

        # 2. 拼接字符串
        sign_str = "&".join([f"{k}={v}" for k, v in sorted_params])

        print(f"\n🔍 【客户端签名详情】")
        print(f"   签名参数: {params}")
        print(f"   排序后: {sorted_params}")
        print(f"   签名原文: {sign_str}")
        print(f"   SecretKey: {self.secret_key}")
        print(f"   SecretKey长度: {len(self.secret_key)}")

        # 3. HMAC-SHA256加密
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            sign_str.encode('utf-8'),
            hashlib.sha256
        ).digest()

        # 4. Base64编码
        signature_base64 = base64.b64encode(signature).decode('utf-8')

        print(f"   签名结果: {signature_base64}\n")

        return signature_base64

    def _build_headers(self, business_params=None):
        """
        构建请求头（包含签名）

        Args:
            business_params: 业务参数字典（可选）

        Returns:
            请求头字典
        """
        # 公共参数
        timestamp = str(int(time.time()))
        nonce = str(random.randint(100000, 999999))

        # 合并参数（公共参数 + 业务参数）
        params = {
            "AccessKey": self.access_key,
            "Timestamp": timestamp,
            "Nonce": nonce
        }

        if business_params:
            params.update(business_params)

        # 生成签名
        signature = self._generate_signature(params)

        # 构建请求头
        headers = {
            "Content-Type": "application/json",
            "X-AccessKey": self.access_key,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
            "X-Signature": signature
        }

        return headers

    def deduct_point(self, user_id, request_id, points, biz_scene=None, reason=None):
        """
        扣减积分

        Args:
            user_id: 用户ID
            request_id: 请求ID（幂等性保证）
            points: 扣减积分数
            biz_scene: 业务场景（可选）
            reason: 扣减原因（可选）

        Returns:
            响应结果
        """
        url = f"{self.base_url}/openapi/point/deduct"

        # 业务参数（用于签名）
        business_params = {
            "userId": user_id,
            "requestId": request_id,
            "points": str(points)
        }

        if biz_scene:
            business_params["bizScene"] = biz_scene
        if reason:
            business_params["reason"] = reason

        # 构建请求头（包含签名）
        headers = self._build_headers(business_params)

        # 请求体
        body = {
            "userId": user_id,
            "requestId": request_id,
            "points": points,
            "bizScene": biz_scene,
            "reason": reason
        }

        print(f"\n{'=' * 50}")
        print(f"请求: POST {url}")
        print(f"请求头: {json.dumps(headers, indent=2, ensure_ascii=False)}")
        print(f"请求体: {json.dumps(body, indent=2, ensure_ascii=False)}")

        response = requests.post(url, headers=headers, json=body)

        print(f"响应: {response.status_code}")
        print(f"响应体: {response.text}")
        print(f"{'=' * 50}\n")

        return response.json()

    def query_point(self, user_id):
        """
        查询积分

        Args:
            user_id: 用户ID

        Returns:
            响应结果
        """
        url = f"{self.base_url}/openapi/point/query"

        # 业务参数（用于签名）
        business_params = {
            "userId": user_id
        }

        # 构建请求头（包含签名）
        headers = self._build_headers(business_params)

        # 请求参数
        params = {
            "userId": user_id
        }

        print(f"\n{'=' * 50}")
        print(f"请求: GET {url}")
        print(f"请求头: {json.dumps(headers, indent=2, ensure_ascii=False)}")
        print(f"请求参数: {params}")

        response = requests.get(url, headers=headers, params=params)

        print(f"响应: {response.status_code}")
        print(f"响应体: {response.text}")
        print(f"{'=' * 50}\n")

        return response.json()

    def query_point_flow(self, user_id, current=1, size=20, biz_scene=None):
        """
        查询积分明细

        Args:
            user_id: 用户ID
            current: 当前页
            size: 每页条数
            biz_scene: 业务场景（可选）

        Returns:
            响应结果
        """
        url = f"{self.base_url}/openapi/point/flow"

        # 业务参数（用于签名）
        business_params = {
            "userId": user_id,
            "current": str(current),
            "size": str(size)
        }

        if biz_scene:
            business_params["bizScene"] = biz_scene

        # 构建请求头（包含签名）
        headers = self._build_headers(business_params)

        # 请求体
        body = {
            "userId": user_id,
            "current": current,
            "size": size
        }

        if biz_scene:
            body["bizScene"] = biz_scene

        print(f"\n{'=' * 50}")
        print(f"请求: POST {url}")
        print(f"请求头: {json.dumps(headers, indent=2, ensure_ascii=False)}")
        print(f"请求体: {json.dumps(body, indent=2, ensure_ascii=False)}")

        response = requests.post(url, headers=headers, json=body)

        print(f"响应: {response.status_code}")
        print(f"响应体: {response.text}")
        print(f"{'=' * 50}\n")

        return response.json()


def test_aa():
    """测试主函数"""

    # 配置
    BASE_URL = "https://qwtest.zhqh.com.cn/api/zhqhmobileapp/"  # 修改为实际的API地址
    ACCESS_KEY = "qifei"  # 访问密钥
    SECRET_KEY = "a7VQBeEa1A7EPw6FwCTf+QTrHUKx/PNHS0AKGiEWYbE="  # 签名密钥

    # 创建客户端
    client = OpenApiClient(BASE_URL, ACCESS_KEY, SECRET_KEY)

    # 测试用户ID
    user_id = "1001"

    # 1. 查询积分
    print("\n" + "=" * 70)
    print(">>> 测试1：查询积分（GET请求）")
    print("=" * 70)
    result = client.query_point(user_id)
    print(f"查询结果: {json.dumps(result, indent=2, ensure_ascii=False)}\n")

    # 2. 扣减积分
    print("\n" + "=" * 70)
    print(">>> 测试2：扣减积分（POST请求）")
    print("=" * 70)
    request_id = f"REQ_{int(time.time())}_{random.randint(1000, 9999)}"
    result = client.deduct_point(
        user_id=user_id,
        request_id=request_id,
        points=100,
        biz_scene="AI_CHAT",
        reason="AI对话消费测试"
    )
    print(f"扣减结果: {json.dumps(result, indent=2, ensure_ascii=False)}\n")

    # 3. 查询积分明细
    print("\n" + "=" * 70)
    print(">>> 测试3：查询积分明细（POST请求）")
    print("=" * 70)
    result = client.query_point_flow(
        user_id=user_id,
        current=1,
        size=10,
        biz_scene="AI_CHAT"
    )
    print(f"明细结果: {json.dumps(result, indent=2, ensure_ascii=False)}\n")

    print("\n" + "=" * 70)
    print("✅ 所有测试完成！")
    print("=" * 70)


if __name__ == "__main__":
    print("🚀 OpenAPI积分接口测试")
    print("📋 配置信息：")
    print("   Base URL: http://localhost:9104")
    print("   AccessKey: qifei")
    print("   SecretKey: a7VQBeEa1A7EPw6FwCTf+QTrHUKx/PNHS0AKGiEWYbE=")
    test_aa()



