// API Types matching backend models

export enum ScriptType {
  P2PKH = 'p2pkh',
  P2SH = 'p2sh',
  P2WPKH = 'p2wpkh',
  P2WSH = 'p2wsh',
  P2TR = 'p2tr',
  UNKNOWN = 'unknown',
}

export enum HeuristicType {
  COMMON_INPUT = 'common_input',
  ADDRESS_REUSE = 'address_reuse',
  ROUND_AMOUNT = 'round_amount',
  SCRIPT_TYPE_MATCH = 'script_type_match',
  OPTIMAL_CHANGE = 'optimal_change',
  WALLET_FINGERPRINT = 'wallet_fingerprint',
  COINJOIN = 'coinjoin',
  PEEL_CHAIN = 'peel_chain',
  TEMPORAL = 'temporal',
  AMOUNT_PATTERN = 'amount_pattern',
}

export interface NodeData {
  id: string
  label: string
  type: string
  value?: number
  metadata: Record<string, any>
}

export interface EdgeData {
  source: string
  target: string
  amount: number
  txid?: string
  confidence: number
  heuristic?: HeuristicType
  metadata: Record<string, any>
}

export interface ClusterInfo {
  cluster_id: string
  addresses: string[]
  confidence: number
  heuristic: HeuristicType
  tx_count: number
  first_seen?: number
  last_seen?: number
}

export interface CoinJoinInfo {
  coinjoin_type: string
  confidence: number
  num_participants?: number
  equal_output_value?: number
  equal_output_count: number
  change_outputs: number[]
  metadata: Record<string, any>
}

export interface PeelChainHop {
  hop_number: number
  txid: string
  payment_output_index: number
  payment_value: number
  payment_address?: string
  change_output_index: number
  change_value: number
  change_address?: string
  confidence: number
  timestamp?: number
}

export interface TraceGraphResponse {
  nodes: NodeData[]
  edges: EdgeData[]
  clusters: ClusterInfo[]
  coinjoins: CoinJoinInfo[]
  peel_chains: PeelChainHop[][]
  start_txid: string
  start_vout: number
  depth_reached: number
  total_nodes: number
  total_edges: number
}

export interface AddressResponse {
  address: string
  balance: number
  total_received: number
  total_sent: number
  tx_count: number
  utxos: any[]
  transactions: string[]
  cluster_id?: string
  first_seen?: number
  last_seen?: number
}

export interface TransactionResponse {
  transaction: any
  change_output?: number
  change_confidence?: number
  coinjoin_info?: CoinJoinInfo
  cluster_inputs?: string
}

// Graph display types
export interface GraphNode {
  key: string
  label: string
  x: number
  y: number
  size: number
  color: string
  type: string
  metadata: Record<string, any>
}

export interface GraphEdge {
  key: string
  source: string
  target: string
  size: number
  color: string
  type?: string
  label?: string
  metadata: Record<string, any>
}




