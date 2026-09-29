package realtime

import (
	"context"
	"log"
	"strconv"
	"sync"

	"github.com/redis/go-redis/v9"
)

// Broker relays game-change notifications across API replicas so every
// instance can push fresh state to its own socket subscribers.
// MemoryBroker is the single-process default. RedisBroker shares
// notifications when REDIS_URL is set. PostgreSQL remains the source of
// truth either way; the broker only says "game N changed, re-read it".
type Broker interface {
	Publish(gameID int)
	Subscribe(func(gameID int))
	Close() error
}

type MemoryBroker struct {
	mu   sync.Mutex
	subs map[int]func(gameID int)
	next int
}

func NewMemoryBroker() *MemoryBroker {
	return &MemoryBroker{subs: make(map[int]func(gameID int))}
}

func (broker *MemoryBroker) Publish(gameID int) {
	broker.mu.Lock()
	subs := make([]func(gameID int), 0, len(broker.subs))
	for _, sub := range broker.subs {
		subs = append(subs, sub)
	}
	broker.mu.Unlock()
	for _, sub := range subs {
		sub(gameID)
	}
}

func (broker *MemoryBroker) Subscribe(fn func(gameID int)) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	broker.next++
	broker.subs[broker.next] = fn
}

func (broker *MemoryBroker) Close() error { return nil }

const redisChannel = "chess:games"

type RedisBroker struct {
	client *redis.Client
	cancel context.CancelFunc
	done   chan struct{}
}

func NewRedisBroker(url string) (*RedisBroker, error) {
	options, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(options)
	ctx, cancel := context.WithCancel(context.Background())
	if err := client.Ping(ctx).Err(); err != nil {
		cancel()
		client.Close()
		return nil, err
	}
	broker := &RedisBroker{client: client, cancel: cancel, done: make(chan struct{})}
	return broker, nil
}

// SubscribeRemote starts delivery of remote notifications to fn. Call once;
// notifications published by this same process are echoed back by Redis and
// delivered like any other replica's, so every hub converges on pushes.
func (broker *RedisBroker) SubscribeRemote(fn func(gameID int)) {
	pubsub := broker.client.Subscribe(context.Background(), redisChannel)
	go func() {
		defer close(broker.done)
		defer pubsub.Close()
		for message := range pubsub.Channel() {
			gameID, err := strconv.Atoi(message.Payload)
			if err != nil {
				continue
			}
			fn(gameID)
		}
	}()
}

func (broker *RedisBroker) Publish(gameID int) {
	if err := broker.client.Publish(context.Background(), redisChannel, strconv.Itoa(gameID)).Err(); err != nil {
		log.Printf("realtime broker publish failed: %v", err)
	}
}

func (broker *RedisBroker) Subscribe(fn func(gameID int)) {
	broker.SubscribeRemote(fn)
}

func (broker *RedisBroker) Close() error {
	broker.cancel()
	err := broker.client.Close()
	<-broker.done
	return err
}
