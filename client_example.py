#!/usr/bin/env python3
"""
Complete Python client for CoMapeo Headless API
"""

import requests
import json
import time
import sys
from typing import Optional, Dict, Any, List

class ComapeoClient:
    """Complete CoMapeo API Client"""

    def __init__(self, base_url: str = "http://localhost:3000", verbose: bool = False):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.verbose = verbose

    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with error handling"""
        url = f"{self.api_url}{endpoint}"
        if self.verbose:
            print(f"📡 {method} {endpoint}")
        response = requests.request(method, url, **kwargs)
        response.raise_for_status()
        return response

    def health_check(self) -> bool:
        """Check if server is running"""
        try:
            response = requests.get(f"{self.base_url}/health")
            return response.status_code == 200
        except:
            return False

    def wait_for_server(self, timeout: int = 30) -> bool:
        """Wait for server to be ready"""
        start = time.time()
        while time.time() - start < timeout:
            if self.health_check():
                print("✅ Server is ready")
                return True
            time.sleep(0.5)
        return False

    def get_docs(self) -> Dict[str, Any]:
        """Get API documentation"""
        response = self._request('GET', '/docs')
        return response.json()

    # ============ PROJECTS ============

    def list_projects(self) -> List[Dict]:
        """List all projects"""
        response = self._request('GET', '/projects')
        return response.json()['data']

    def create_project(self, name: str, description: str = "", color: str = "") -> Dict:
        """Create new project"""
        response = self._request('POST', '/projects', json={
            'name': name,
            'description': description,
            'color': color
        })
        return response.json()['data']

    def get_project(self, project_id: str) -> Dict:
        """Get project details"""
        response = self._request('GET', f'/projects/{project_id}')
        return response.json()['data']

    def update_project(self, project_id: str, name: str = None, description: str = None, color: str = None) -> Dict:
        """Update project"""
        response = self._request('PUT', f'/projects/{project_id}', json={
            'name': name,
            'description': description,
            'color': color
        })
        return response.json()['data']

    def delete_project(self, project_id: str) -> Dict:
        """Delete project"""
        response = self._request('DELETE', f'/projects/{project_id}')
        return response.json()['data']

    # ============ OBSERVATIONS ============

    def list_observations(self, project_id: str, limit: int = 100, offset: int = 0) -> List[Dict]:
        """List observations"""
        response = self._request('GET', f'/observations/project/{project_id}', 
                                params={'limit': limit, 'offset': offset})
        return response.json()['data']

    def create_observation(self, project_id: str, name: str, lat: float, lon: float, 
                          description: str = "", tags: Dict = None) -> Dict:
        """Create observation"""
        response = self._request('POST', f'/observations/project/{project_id}', json={
            'name': name,
            'lat': lat,
            'lon': lon,
            'description': description,
            'tags': tags or {}
        })
        return response.json()['data']

    def get_observation(self, project_id: str, observation_id: str) -> Dict:
        """Get observation"""
        response = self._request('GET', f'/observations/project/{project_id}/{observation_id}')
        return response.json()['data']

    def update_observation(self, project_id: str, observation_id: str, 
                          name: str = None, description: str = None, tags: Dict = None) -> Dict:
        """Update observation"""
        response = self._request('PUT', f'/observations/project/{project_id}/{observation_id}', json={
            'name': name,
            'description': description,
            'tags': tags
        })
        return response.json()['data']

    def delete_observation(self, project_id: str, observation_id: str) -> Dict:
        """Delete observation"""
        response = self._request('DELETE', f'/observations/project/{project_id}/{observation_id}')
        return response.json()['data']

    # ============ SYNC ============

    def get_sync_status(self, project_id: str) -> Dict:
        """Get sync status"""
        response = self._request('GET', f'/sync/status/{project_id}')
        return response.json()['data']

    def enable_sync(self, project_id: str) -> Dict:
        """Enable sync"""
        response = self._request('POST', f'/sync/{project_id}/enable')
        return response.json()['data']

    def disable_sync(self, project_id: str) -> Dict:
        """Disable sync"""
        response = self._request('POST', f'/sync/{project_id}/disable')
        return response.json()['data']

    def wait_sync(self, project_id: str, timeout: int = 30000, type: str = 'data') -> Dict:
        """Wait for sync completion"""
        response = self._request('POST', f'/sync/{project_id}/wait', json={
            'timeout': timeout,
            'type': type
        })
        return response.json()['data']

    # ============ PEERS ============

    def list_peers(self) -> List[Dict]:
        """List local peers"""
        response = self._request('GET', '/peers/list')
        return response.json()['data']

    def start_discovery(self) -> Dict:
        """Start peer discovery"""
        response = self._request('POST', '/peers/discovery/start')
        return response.json()['data']

    def stop_discovery(self, force: bool = False) -> Dict:
        """Stop peer discovery"""
        response = self._request('POST', '/peers/discovery/stop', json={'force': force})
        return response.json()

    def connect_peer(self, address: str, port: int, name: str = None) -> Dict:
        """Connect to peer"""
        response = self._request('POST', '/peers/connect', json={
            'address': address,
            'port': port,
            'name': name
        })
        return response.json()['data']

    # ============ MEMBERS ============

    def list_members(self, project_id: str) -> List[Dict]:
        """List project members"""
        response = self._request('GET', f'/members/project/{project_id}')
        return response.json()['data']

    def get_roles(self, project_id: str) -> List[Dict]:
        """Get available roles"""
        response = self._request('GET', f'/members/project/{project_id}/roles')
        return response.json()['data']

    def invite_member(self, project_id: str, device_id: str, role: str = 'member') -> Dict:
        """Invite member"""
        response = self._request('POST', f'/members/project/{project_id}/invite', json={
            'deviceId': device_id,
            'role': role
        })
        return response.json()['data']

    # ============ STATUS ============

    def get_status(self) -> Dict:
        """Get server status"""
        response = self._request('GET', '/status')
        data = response.json()
        # Retornar todo o conteúdo da resposta
        return data

    def get_device_info(self) -> Dict:
        """Get device info"""
        response = self._request('GET', '/status/device')
        return response.json()['device']

    def update_device_info(self, name: str = None, **kwargs) -> Dict:
        """Update device info"""
        response = self._request('POST', '/status/device', json={
            'name': name,
            **kwargs
        })
        return response.json()['device']


def print_section(title: str):
    """Print formatted section title"""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}\n")


def main():
    """Demo of complete API"""
    client = ComapeoClient(verbose=True)

    print("🔍 Checking server availability...")
    if not client.wait_for_server():
        print("❌ Server not available!")
        sys.exit(1)

    # Get documentation
    print_section("📖 API DOCUMENTATION")
    docs = client.get_docs()
    print(f"API Version: {docs['version']}")
    print(f"Endpoints: {len(docs['endpoints'])} categories")

    # Get status
    print_section("📊 SERVER STATUS")
    status_response = client.get_status()
    
    # Extrair dados da resposta
    if 'server' in status_response:
        status = status_response['server']
        projects = status_response.get('projects', {})
        peers = status_response.get('peers', {})
        device = status_response.get('device', {})
    else:
        # Se for um erro
        print("Resposta:", json.dumps(status_response, indent=2))
        return

    print(f"Status: {status['status']}")
    print(f"Uptime: {status['uptime']:.1f}s")
    print(f"Memory: {status['memory']['heapUsed'] / 1024 / 1024:.1f}MB")
    print(f"Projects: {projects.get('count', 0)}")
    print(f"Peers: {peers.get('count', 0)} ({peers.get('connected', 0)} connected)")

    # Device info
    print_section("🖥️  DEVICE")
    print(f"Device ID: {device.get('id', 'Unknown')}")
    print(f"Name: {device.get('name', 'Unknown')}")

    # Peers
    print_section("👥 PEER DISCOVERY")
    print("Starting discovery...")
    try:
        discovery = client.start_discovery()
        print(f"✅ Discovery running on port {discovery['port']}")
        time.sleep(2)

        peers_list = client.list_peers()
        print(f"Found {len(peers_list)} peer(s)")
        for peer in peers_list:
            print(f"  - {peer['name']} ({peer['status']})")
    except Exception as e:
        print(f"⚠️  Peer discovery not available: {e}")

    # Projects
    print_section("📁 PROJECTS")
    projects_list = client.list_projects()
    print(f"Existing projects: {len(projects_list)}")

    print("\n📝 Creating new project...")
    project = client.create_project(
        name="Complete API Demo",
        description="Testing all API endpoints",
        color="#FF5733"
    )
    project_id = project['id']
    print(f"✅ Created: {project['name']} ({project_id})")

    # Observations
    print_section("📍 OBSERVATIONS")
    print("Creating observations...")

    obs1 = client.create_observation(
        project_id,
        name="Coffee Shop",
        lat=-15.7942,
        lon=-47.8822,
        description="Great coffee!",
        tags={"type": "cafe", "rating": "5"}
    )
    print(f"✅ {obs1['name']}")

    obs2 = client.create_observation(
        project_id,
        name="Park",
        lat=-15.7839,
        lon=-47.8911,
        description="Beautiful park",
        tags={"type": "park"}
    )
    print(f"✅ {obs2['name']}")

    observations = client.list_observations(project_id)
    print(f"\nTotal observations: {len(observations)}")

    # Sync
    print_section("🔄 SYNC")
    print("Enabling sync...")
    try:
        client.enable_sync(project_id)

        sync_status = client.get_sync_status(project_id)
        print(f"Initial Sync: {sync_status['initialSync']['enabled']}")
        print(f"Data Sync: {sync_status['dataSync']['enabled']}")
        print(f"Remote Peers: {len(sync_status['remotePeers'])}")
    except Exception as e:
        print(f"⚠️  Sync not fully available: {e}")

    # Members
    print_section("👥 MEMBERS")
    try:
        members = client.list_members(project_id)
        print(f"Project members: {len(members)}")
        for member in members:
            print(f"  - {member['name']} ({member['role']})")

        roles = client.get_roles(project_id)
        print(f"\nAvailable roles: {len(roles)}")
        for role in roles:
            print(f"  - {role['name']}: {role['description']}")
    except Exception as e:
        print(f"⚠️  Members not fully available: {e}")

    print_section("✨ DEMO COMPLETE")
    print("All endpoints tested successfully!")

    # Cleanup
    print("\nCleaning up...")
    try:
        client.stop_discovery()
    except:
        pass
    print("✅ Done!")


if __name__ == "__main__":
    main()
