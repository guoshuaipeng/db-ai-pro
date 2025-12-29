#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信支付回调数据解密测试
使用 Python 实现 AES-GCM 解密

@author snowy
@date 2024/12/25
"""

import json
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend

# APIv3密钥（32位字符串）
# 注意：请替换为实际的APIv3密钥
API_V3_KEY = "HMNQ6EOrKO5C0qYR3qdKGPo2H4E5ZvSQ"

# 备选密钥列表（如果第一个密钥失败，可以尝试这些）
ALTERNATIVE_KEYS = [
    "QyfNbfesJa0KWIrcoV8tQENDe5rlIKv9",  # 配置文件中的原始密钥
    "HMNQ6EOrKO5C0qYR3qdKGPo2H4E5ZvSQ"
    # 可以添加更多备选密钥
]


def decrypt_wechat_callback(ciphertext, nonce, associated_data, api_v3_key):
    """
    解密微信支付v3回调通知中的resource数据
    
    Args:
        ciphertext: 加密的密文（Base64编码）
        nonce: 随机字符串（Base64编码）
        associated_data: 附加数据（固定为"transaction"）
        api_v3_key: APIv3密钥（32位字符串）
    
    Returns:
        解密后的JSON字符串
    """
    try:
        # 验证密钥长度（必须是32字节）
        key_bytes = api_v3_key.encode('utf-8')
        if len(key_bytes) != 32:
            raise ValueError(f"APIv3密钥长度必须为32字节，当前长度: {len(key_bytes)}")
        
        # Base64解码nonce
        nonce_bytes = base64.b64decode(nonce)
        
        # 处理associatedData（如果为空则使用默认值"transaction"）
        aad = associated_data if associated_data else "transaction"
        associated_data_bytes = aad.encode('utf-8')
        
        # Base64解码ciphertext
        ciphertext_bytes = base64.b64decode(ciphertext)
        
        # 使用AES-GCM解密
        aesgcm = AESGCM(key_bytes)
        decrypted_bytes = aesgcm.decrypt(nonce_bytes, ciphertext_bytes, associated_data_bytes)
        
        # 转换为字符串
        decrypted_text = decrypted_bytes.decode('utf-8')
        return decrypted_text
        
    except Exception as e:
        raise Exception(f"解密失败: {str(e)}")


def test_decrypt():
    """测试解密微信支付回调数据"""
    # 测试数据（从微信支付回调通知中获取）
    callback_json = {
        "id": "c2b91e82-6a31-5c65-a421-3f2534084bb7",
        "create_time": "2025-12-25T13:34:38+08:00",
        "resource_type": "encrypt-resource",
        "event_type": "TRANSACTION.SUCCESS",
        "summary": "支付成功",
        "resource": {
            "algorithm": "AEAD_AES_256_GCM",
            "ciphertext": "RNgphlrIQwiX2xoexuT/iwN1PcmABD17Lrtgz8rztumGq7bw8DRuOPz01VSj9I3x5DYXcEdeQoiKAM541wYx0F+HIuOHhgzQoWvHRCVHBjpCGnDPvcw2qso+cfOOZS6KqZ1C6pAHdjME5N8U/8fI8AQ8mP5WF9LUG0nKOa48ZJMEiYFh5V//Uni5+j6pCG+X8+getkt0T45QlRRbKZKntsrR9dRc6m2zw1DQKPHQg/ePFqK8rg3dEzUa8vxdGgfD8eTPV/T7syQ3AFOcJTtRpBtPsSuXi7dVz78YMPvXJUsLojcu++XDjMDxGy0zGclURxsTND9H45uvfxDSvUVe1416t965io2FWgoQ0FwybyhbJQ5RcflZ3PNTbMTUIXYVziSWyGxjCiZmFVyceHvDP3u6oOUKProSx7GNsF21jvvhdUseb8gbgZkS7DviGLukwEgc3zPeDf5NdkPnQk6ojJcOX3OTcbs/x2zSg8BvNKu58PQGItEKc6dD40N67Tn1QS108WPcGUVsl426Ed0lG5D7wNqsYqS8VbU2+g8idt2ZplfI+pxqtd1aSnK7RZAFmfG1Tg==",
            "associated_data": "transaction",
            "nonce": "UQhoha1C8WWO",
            "original_type": "transaction"
        }
    }
    
    try:
        print("=== 微信支付回调数据解密测试 ===\n")
        
        # 提取加密数据
        resource = callback_json["resource"]
        ciphertext = resource["ciphertext"]
        nonce = resource["nonce"]
        associated_data = resource["associated_data"]
        algorithm = resource["algorithm"]
        
        print("回调基本信息:")
        print(f"  事件类型: {callback_json['event_type']}")
        print(f"  通知ID: {callback_json['id']}")
        print(f"  创建时间: {callback_json['create_time']}")
        print(f"  摘要: {callback_json['summary']}")
        print("\n加密数据信息:")
        print(f"  算法: {algorithm}")
        print(f"  ciphertext长度: {len(ciphertext)} 字符")
        print(f"  nonce: {nonce}")
        print(f"  associated_data: {associated_data}")
        print(f"  original_type: {resource['original_type']}")
        
        # 验证密钥长度
        key_bytes = API_V3_KEY.encode('utf-8')
        print(f"\n密钥信息:")
        print(f"  APIv3密钥: {API_V3_KEY[:8]}***")
        print(f"  密钥长度: {len(key_bytes)} 字节")
        
        if len(key_bytes) != 32:
            raise ValueError(f"APIv3密钥长度必须为32字节，当前长度: {len(key_bytes)}")
        
        # 处理associatedData
        aad = associated_data if associated_data else "transaction"
        associated_data_bytes = aad.encode('utf-8')
        print(f"\n解密参数信息:")
        print(f"  associatedData: {aad}")
        print(f"  associatedData字节长度: {len(associated_data_bytes)}")
        
        # Base64解码nonce
        nonce_bytes = base64.b64decode(nonce)
        print(f"  nonce原始值: {nonce}")
        print(f"  nonce Base64解码后长度: {len(nonce_bytes)} 字节")
        print(f"  ciphertext长度: {len(ciphertext)} 字符")
        
        # 尝试使用主密钥解密
        print("\n=== 尝试使用主密钥解密 ===")
        decrypted_text = None
        try:
            decrypted_text = decrypt_wechat_callback(ciphertext, nonce, associated_data, API_V3_KEY)
            print("✅ 主密钥解密成功！")
        except Exception as e:
            print(f"❌ 主密钥解密失败: {e}")
            
            # 如果主密钥失败，尝试备选密钥
            if ALTERNATIVE_KEYS:
                print("\n=== 主密钥解密失败，尝试备选密钥 ===")
                for i, alt_key in enumerate(ALTERNATIVE_KEYS, 1):
                    print(f"\n尝试备选密钥 {i}:")
                    try:
                        decrypted_text = decrypt_wechat_callback(ciphertext, nonce, associated_data, alt_key)
                        print(f"✅ 备选密钥 {i} 解密成功！")
                        break
                    except Exception as e2:
                        print(f"❌ 备选密钥 {i} 解密失败: {e2}")
        
        if decrypted_text is None:
            raise Exception("所有密钥都解密失败，请检查APIv3密钥是否正确")
        
        print("\n=== 解密成功！===")
        print("解密后的JSON:")
        print(decrypted_text)
        
        # 解析解密后的JSON
        transaction_data = json.loads(decrypted_text)
        print("\n=== 交易信息解析 ===")
        print(f"商户订单号: {transaction_data.get('out_trade_no')}")
        print(f"微信支付订单号: {transaction_data.get('transaction_id')}")
        print(f"交易状态: {transaction_data.get('trade_state')}")
        print(f"交易类型: {transaction_data.get('trade_type')}")
        if 'trade_state_desc' in transaction_data:
            print(f"交易状态描述: {transaction_data.get('trade_state_desc')}")
        
        # 提取金额信息
        if 'amount' in transaction_data:
            amount_obj = transaction_data['amount']
            print("\n=== 金额信息 ===")
            if 'total' in amount_obj:
                total = amount_obj['total']
                print(f"总金额(分): {total}")
                print(f"总金额(元): {total / 100.0}")
            if 'payer_total' in amount_obj:
                payer_total = amount_obj['payer_total']
                print(f"用户支付金额(分): {payer_total}")
                print(f"用户支付金额(元): {payer_total / 100.0}")
            if 'currency' in amount_obj:
                print(f"货币类型: {amount_obj['currency']}")
        
        # 提取其他信息
        if 'success_time' in transaction_data:
            print(f"\n支付成功时间: {transaction_data.get('success_time')}")
        if 'payer' in transaction_data:
            print(f"支付者信息: {json.dumps(transaction_data.get('payer'), ensure_ascii=False, indent=2)}")
        
        # 验证解密结果
        assert decrypted_text is not None, "解密结果不能为空"
        assert len(decrypted_text) > 0, "解密结果不能为空字符串"
        assert 'out_trade_no' in decrypted_text, "解密结果应包含订单号"
        assert 'transaction_id' in decrypted_text, "解密结果应包含微信订单号"
        
        print("\n✅ 所有测试通过！")
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        print("\n可能的原因：")
        print("1. APIv3密钥不正确（与微信商户平台配置不一致）")
        print("2. 请检查微信商户平台 -> API安全 -> APIv3密钥")
        print("3. 确保使用的密钥与加密时使用的密钥一致")
        print("4. 密文可能被修改或损坏")
        raise


if __name__ == "__main__":
    test_decrypt()

