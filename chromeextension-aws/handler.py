from typing import List
import json
import boto3
import io
import numpy as np

s3 = boto3.client('s3')


class PlusOne:
    id: int
    uid: str
    url: str
    title: str
    status: str
    number: int
    subtitle: str
    related: List[str]
    content: str
    word_count: int

    def __init__(self, id: int, uid: str, url: str, title: str, status: str, number: int, subtitle: str, related: List[str], content: str, word_count: int):
        self.id = id
        self.uid = uid
        self.url = url
        self.title = title
        self.status = status
        self.number = number
        self.subtitle = subtitle
        self.related = related
        self.content = content
        self.word_count = word_count

    def is_related_to(self, other: "PlusOne") -> bool:
        return len(set(self.related).intersection(set(other.related))) > 0
    
    def to_dict(self, exclude: None) -> dict:
        include = ("id", "uid", "number", "status", "url", "title", "subtitle", "content", "related")
        if exclude is not None:
            include = tuple(x for x in include if x not in exclude)

        return {
            key: getattr(self, key) for key in include
        }

    def to_json(self, **kwargs) -> str:
        return json.dumps(self.to_dict(), **kwargs)
    
    def __hash__(self) -> int:
        return self.number


def load_correlation():
    bucket = "plusonerecommender"
    key = "correlation.npy"
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        bytes = response['Body'].read()
        correlation = np.load(io.BytesIO(bytes))
        return correlation
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e


def load_plus_ones():
    bucket = "plusonerecommender"
    key = "allParsed.json"
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        json_data = json.loads(response['Body'].read().decode())
        return [PlusOne(
            p["id"],
            p["uid"],
            p["url"],
            p["title"],
            p["status"],
            p["number"],
            p["subtitle"],
            p["related"],
            p["content"],
            p["wordCount"],
        ) for p in json_data]
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e


def load_plus_ones_locally() -> List[PlusOne]:
    with open("plusones\\allParsed.json", encoding="utf8") as f:
        r = json.load(f)
    return [PlusOne(
        p["id"],
        p["uid"],
        p["url"],
        p["title"],
        p["status"],
        p["number"],
        p["subtitle"],
        p["related"],
        p["content"],
        p["wordCount"],
    ) for p in r]


def get_similar_plus_ones(correlation: np.array, i: int, count: int = 10, restrict_to: List[int] = None) -> List[int]:
    row = np.copy(correlation[i])
    row = np.delete(row, i)  # Remove the identity point
    ordered = np.argsort(row)
    if restrict_to is not None:
        ordered = [j for j in ordered if j in restrict_to]
    return ordered[:count]


def get_most_correlated_plus_ones(correlation: np.array) -> List[int]:
    results = []
    for i, row in enumerate(correlation):
        row = np.copy(row)
        row[i] = 0  # Remove the identity point
        mean = sum(row) / len(row)
        results.append((i, mean))
    results.sort(key=lambda pair: pair[1], reverse=True)
    return [i for i, _ in results]


def recommend(liked_indexes: List[int], completed_indexes: List[int], correlation: np.array, plus_ones_metadata: List[PlusOne], apply_word_count_fix: bool = True) -> List[int]:
    results = []
    for i, row in enumerate(correlation):
        if i in completed_indexes:
            continue
        # Do some normalization so that the most-correlated +1s are not always recommended
        row = np.copy(row)
        row -= np.amin(row)
        row /= np.amax(row)
        mean = sum(row[l] for l in liked_indexes) / len(liked_indexes)
        results.append((i, mean))
    results.sort(key=lambda pair: pair[1], reverse=True)

    # Apply additional normalization to account for the word count. This normalization is auto-calculated using a linear regression.
    if apply_word_count_fix:
        X = [plus_ones_metadata[i].word_count for i, _ in results]
        Y = [mean for i, mean in results]
        z = np.polyfit(X, Y, 1)
        p = np.poly1d(z)
        multipliers = [p(x) for x in X]

        results = []
        for i, row in enumerate(correlation):
            if i in completed_indexes:
                continue
            # Do some normalization so that the most-correlated +1s are not always recommended
            row = np.copy(row)
            row -= np.amin(row)
            row /= np.amax(row)
            mean = sum(row[l] for l in liked_indexes) / len(liked_indexes)
            results.append((i, mean))
        results.sort(key=lambda pair: pair[1], reverse=True)
        results = [(results[i][0], results[i][1] / multipliers[i]) for i in range(len(results))]
        results.sort(key=lambda pair: pair[1], reverse=True)

    recommended = [i for i, _ in results]
    return recommended


def lambda_handler(event, context):
    print("Received event: " + json.dumps(event))

    # Handle the OPTIONS request
    if event["requestContext"]["httpMethod"] == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "OPTIONS, GET, POST, PUT, DELETE",
                "Access-Control-Allow-Headers": "*",
            },
            "body": "{}",
        }

    secret = event["headers"]["secret"]
    if secret != "Jyq5qtpQOk05wp97144I":
        raise RuntimeError("Access denied")

    body = json.loads(event["body"])
    liked_ids: List[str] = body["faves"]
    completed_ids: List[str] = body["completed"]
    N: int = body["count"]
    path: str = event["requestContext"]["resourcePath"]

    correlation = load_correlation()
    plus_ones_metadata: List[PlusOne] = load_plus_ones()
    # plus_ones_metadata = load_plus_ones_locally()

    liked_pos = [po for po in plus_ones_metadata if str(po.id) in liked_ids]
    liked_indexes = [i for i, po in enumerate(plus_ones_metadata) if po in liked_pos]
    completed_pos = [po for po in plus_ones_metadata if str(po.id) in completed_ids]
    completed_indexes = [i for i, po in enumerate(plus_ones_metadata) if po in completed_pos]

    if "most-correlated" in path:
        print(f"Most correlated +1s:")
        results = get_most_correlated_plus_ones(correlation)
        most_correlated_plus_ones: List[PlusOne] = []
        for i in results[:N]:
            print(f"{plus_ones_metadata[i].title} -- {plus_ones_metadata[i].url}")
            most_correlated_plus_ones.append(plus_ones_metadata[i])
            similar = get_similar_plus_ones(correlation=correlation, i=i, count=3)
            for j in similar:
                print(f"   {plus_ones_metadata[j].title}")
        result = [po.to_dict(exclude=("content",)) for po in most_correlated_plus_ones]

    elif "not-recommended" in path:
        print(f"NOT recommended +1s. I.e. something different:")
        recommended = recommend(liked_indexes, completed_indexes, correlation, plus_ones_metadata, True)
        not_recommended_plus_ones: List[PlusOne] = []
        for i in recommended[len(recommended) - N:]:
            not_recommended_plus_ones.append(plus_ones_metadata[i])
            print(f"{plus_ones_metadata[i].title} -- {plus_ones_metadata[i].url}")
        result = [po.to_dict(exclude=("content",)) for po in not_recommended_plus_ones]

    elif "recommended" in path:
        print(f"Recommended +1s:")
        recommended = recommend(liked_indexes, completed_indexes, correlation, plus_ones_metadata, True)
        recommended_plus_ones: List[PlusOne] = []
        for i in recommended[:N]:
            recommended_plus_ones.append(plus_ones_metadata[i])
            print(f"{plus_ones_metadata[i].title} -- {plus_ones_metadata[i].url}")
            similar = get_similar_plus_ones(correlation=correlation, i=i, count=3, restrict_to=liked_indexes)
            for j in similar:
                print(f"   {plus_ones_metadata[j].title}")
        result = [po.to_dict(exclude=("content",)) for po in recommended_plus_ones]

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Content-Type": "application/json",
        },
        "body": json.dumps(result)
    }
