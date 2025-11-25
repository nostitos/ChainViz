"""API endpoint to get ALL available servers with test results"""

from fastapi import APIRouter
from typing import List, Dict
import json
import os

router = APIRouter()

@router.get("/all-servers")
async def get_all_servers() -> List[Dict]:
    """
    Get list of ALL servers with actual test results
    
    Returns full list of 247 tested servers with performance metrics
    """
    # Load actual test results
    json_path = os.path.join(os.path.dirname(__file__), '..', '..', 'working_servers.json')
    
    try:
        with open(json_path, 'r') as f:
            servers = json.load(f)
        return servers
    except FileNotFoundError:
        return []

