"""Source-grid constraints for territorial growth; no synthetic electrical edges."""
from collections import defaultdict, deque
import heapq


def components(graph, members):
    remaining=set(members);result=[]
    while remaining:
        todo=[min(remaining)];found=set()
        while todo:
            key=todo.pop()
            if key not in remaining:continue
            remaining.remove(key);found.add(key);todo.extend(graph.get(key,set()) & members)
        result.append(found)
    return sorted(result,key=lambda c:(-len(c),min(c)))


def source_graph(nodes, edges):
    graph={n['key']:set() for n in nodes}
    for edge in edges:
        a,b=edge['from'],edge['to']
        graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
    return graph


def validate_grid(payload):
    edges=payload.get('gridConnections')
    if not isinstance(edges,list) or len(edges)>200000:
        raise ValueError('Load the native Grid connections before building network-backed regions.')
    nodes={n['key'] for n in payload['nodes']}
    for edge in edges:
        if not isinstance(edge,dict) or not isinstance(edge.get('id'),str) or not edge['id'] or len(edge['id'])>2048:
            raise ValueError('Every grid connection needs a source identity.')
        for endpoint in ('from','to'):
            key=edge.get(endpoint)
            if not isinstance(key,str) or not key or len(key)>2048:
                raise ValueError('Every grid connection needs scoped endpoint identities.')
            if key not in nodes and not (edge.get(f'{endpoint}External') is True and key.startswith('external:')):
                raise ValueError('Grid connection endpoints do not match the supplied native buses.')


def connected_blocks(regions, graph):
    """Close inseparable whole-unit grid pieces through existing source paths."""
    node_unit={key:i for i,r in enumerate(regions) for key in r['members']}
    land_nodes=set(node_unit)
    land_graph={key:graph.get(key,set()) & land_nodes for key in node_unit}
    parent=list(range(len(regions)))
    def root(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    def members():
        result=defaultdict(set)
        for key,i in node_unit.items():result[root(i)].add(key)
        return result
    closures=[]
    for _ in range(len(regions)):
        bad=None
        for unit,keys in sorted(members().items()):
            parts=components(land_graph,keys)
            if len(parts)>1:
                bad=(unit,keys,parts);break
        if bad is None:break
        unit,keys,parts=bad
        queue=deque(sorted(parts[0]));previous={key:None for key in parts[0]};targets=set.union(*parts[1:]);end=None
        while queue:
            key=queue.popleft()
            if key in targets:end=key;break
            for neighbour in sorted(land_graph[key]):
                if neighbour not in previous:previous[neighbour]=key;queue.append(neighbour)
        if end is None:
            raise ValueError(f"{regions[unit]['feature']['properties']['id']} contains source-grid pieces with no reported in-scope connecting path. Load missing grid detail or use finer source geography.")
        path=[]
        while end is not None:path.append(end);end=previous[end]
        joined={root(node_unit[key]) for key in path};chosen=min(joined)
        closures.append({'regionIds':[regions[i]['feature']['properties']['id'] for i in sorted(joined)],'sourceBusPath':path[::-1]})
        for i in joined:parent[i]=chosen
    else:
        raise ValueError('Source-grid closure did not converge; no grouping applied.')
    blocks=defaultdict(set)
    for i in range(len(regions)):blocks[root(i)].add(i)
    block_members={b:set.union(*(set(regions[i]['members']) for i in units)) for b,units in blocks.items()}
    adjacency={b:set() for b in blocks if block_members[b]}
    for key,neighbours in land_graph.items():
        a=root(node_unit[key])
        for neighbour in neighbours:
            b=root(node_unit[neighbour])
            if a!=b:adjacency[a].add(b)
    return blocks,block_members,adjacency,closures


def network_growth(regions, ranking, geo, centres, contrast, distance, scale, count, influence, nodes, edges):
    """Reserve viable ranked cores, grow on real branches, then cover empty land."""
    graph=source_graph(nodes,edges)
    blocks,members,grid,closures=connected_blocks(regions,graph)
    positive={b for b in blocks if members[b]}
    if len(positive)<count:
        raise ValueError(f'Only {len(positive)} independent, source-grid-connected geographic blocks support this network; choose at most that many clusters.')
    source_components=components(grid,positive)
    if count<len(source_components):
        raise ValueError(f'The source grid has {len(source_components)} disconnected pieces; at least that many clusters are needed without inventing connections.')
    component_of={b:c for c,part in enumerate(source_components) for b in part}
    block_of={i:b for b,units in blocks.items() for i in units}
    representative={b:min(units,key=lambda i:(ranking.index(i) if i in ranking else len(regions),i)) for b,units in blocks.items()}
    block_geo={b:set() for b in blocks}
    for i,neighbours in enumerate(geo):
        for j in neighbours:
            a,b=block_of[i],block_of[j]
            if a!=b:block_geo[a].add(b)
    def step(a,b,seed):
        return distance(centres[a],centres[b])/(scale or 1.)*(1.+influence*(contrast(b,seed)+contrast(a,b))/2.)
    owners={};seeds=[];reserved=set();adjustments=[];represented=set();seed_blocks=[]
    for seed in ranking:
        if len(seeds)==count:break
        start=block_of[seed]
        if start in owners:
            adjustments.append({'regionId':regions[seed]['feature']['properties']['id'],'reason':'Already belongs to a higher-ranked connected core.'});continue
        needed=set(range(len(source_components)))-represented
        only_missing=(count-len(seeds)==len(needed))
        allowed={b for b in positive if b not in owners and (not only_missing or component_of[b] in needed)}
        queue=[(0.,start)];costs={start:0.};previous={start:None};target=None
        while queue:
            cost,b=heapq.heappop(queue)
            if cost!=costs[b]:continue
            if b in allowed:target=b;break
            # Never traverse a reserved core or a different grid-bearing block.
            if b in positive:continue
            for neighbour in sorted(block_geo[b]):
                if neighbour in owners:continue
                candidate=cost+step(representative[b],representative[neighbour],seed)
                if candidate<costs.get(neighbour,float('inf')):
                    costs[neighbour]=candidate;previous[neighbour]=b;heapq.heappush(queue,(candidate,neighbour))
        if target is None:
            adjustments.append({'regionId':regions[seed]['feature']['properties']['id'],'reason':'No unclaimed connected grid core reachable through source geography.'});continue
        label=len(seeds);seeds.append(seed);seed_blocks.append(target);represented.add(component_of[target])
        path=[];b=target
        while b is not None:owners[b]=label;reserved.add(b);path.append(b);b=previous[b]
        if not members[start]:
            adjustments.append({'regionId':regions[seed]['feature']['properties']['id'],'reason':'Expanded to a real source-grid core.',
                'coreRegionIds':sorted(regions[i]['feature']['properties']['id'] for b in path for i in blocks[b])})
    if len(seeds)!=count:
        raise ValueError(f'Only {len(seeds)} evidence-ranked cores can support distinct connected regions at this source geography. Reduce the count or choose another geography/evidence stack.')
    # Each addition is a connected block plus a reported branch to its owner.
    # The region's induced source-bus graph therefore stays connected.
    costs={b:0. for b in seed_blocks};queue=[]
    def offer(b,label):
        for target in sorted(grid[b]):
            if target in owners:continue
            cost=costs[b]+step(representative[b],representative[target],seeds[label])
            heapq.heappush(queue,(cost,label,target))
    for label,b in enumerate(seed_blocks):offer(b,label)
    while queue:
        cost,label,b=heapq.heappop(queue)
        if b in owners:continue
        owners[b]=label;costs[b]=cost;offer(b,label)
    if any(b not in owners for b in positive):
        raise ValueError('A source-grid component has no seed; no partial network grouping applied.')
    labels={i:owners[b] for b,units in blocks.items() if b in owners for i in units}
    # Fill all remaining land using the same evidence/geographic cost. This
    # changes no grid membership, connections, inputs or source coordinates.
    costs={i:0. for i in labels};queue=[]
    def offer_land(i,label):
        for target in geo[i]:
            if target in labels:continue
            heapq.heappush(queue,(costs[i]+step(i,target,seeds[label]),label,target))
    for i,label in list(labels.items()):offer_land(i,label)
    while queue:
        cost,label,i=heapq.heappop(queue)
        if i in labels:continue
        labels[i]=label;costs[i]=cost;offer_land(i,label)
    detached=[];remaining=set(range(len(regions)))-set(labels)
    while remaining:
        todo=[min(remaining)];part=set()
        while todo:
            i=todo.pop()
            if i not in remaining:continue
            remaining.remove(i);part.add(i);todo.extend(geo[i])
        label=min(range(count),key=lambda c:(min(step(seeds[c],i,seeds[c]) for i in part),c))
        for i in part:labels[i]=label
        detached.append([regions[i]['feature']['properties']['id'] for i in sorted(part)])
    for label in range(count):
        keys={key for i,r in enumerate(regions) if labels[i]==label for key in r['members']}
        if not keys or len(components(graph,keys))!=1:
            raise ValueError('A proposed region is not backed by one connected source-grid component; no grouping applied.')
    geo_graph={i:set(neighbours) for i,neighbours in enumerate(geo)}
    geographic_components={f'growth-{label+1}':len(components(geo_graph,{i for i in labels if labels[i]==label}))
                           for label in range(count)}
    return labels,seeds,detached,{'mandatoryGridClosures':closures,'seedAdjustments':adjustments,
        'viableGridBlocks':len(positive),'sourceLandGridComponents':len(source_components),
        'geographicUnitComponents':geographic_components}


def audit_groups(groups,nodes,edges):
    graph=source_graph(nodes,edges)
    membership={key:g['id'] for g in groups for key in g['members']}
    quotient=defaultdict(set);checks=[]
    for edge in edges:
        a=membership.get(edge['from'],f"native:{edge['from']}")
        b=membership.get(edge['to'],f"native:{edge['to']}")
        if a!=b:quotient[a].add(b);quotient[b].add(a)
    for group in groups:
        keys=set(group['members'])
        crossing=[e['id'] for e in edges if (e['from'] in keys)!=(e['to'] in keys)]
        checks.append({'groupId':group['id'],'seedRegionId':group['seedRegionId'],'sourceBuses':len(keys),
            'inducedSourceComponents':len(components(graph,keys)), 'crossingSourceBranchIds':crossing,
            'connectedNeighbours':sorted(quotient.get(group['id'],set()))})
    return {'policy':'nohm.atlas.network-backed-growth.v1','groups':checks,
        'sourceGridComponents':len(components(graph,set(graph))),
        'everyRegionSourceConnected':all(c['sourceBuses']>0 and c['inducedSourceComponents']==1 for c in checks),
        'isolatedRegionIds':[c['groupId'] for c in checks if not c['crossingSourceBranchIds']],
        'syntheticBranches':0,'sourceConnectionCount':len(edges)}
