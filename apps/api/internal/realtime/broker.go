package realtime

import (
	"context"
	"encoding/json"
	"github.com/rajveer/sixtyfour/apps/api/internal/game"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Broker relays game-change notifications across API replicas so every
// instance can push fresh state to its own socket subscribers.
// MemoryBroker is the single-process default. RedisBroker shares
// notifications when REDIS_URL is set. PostgreSQL remains the source of
// truth either way; move notifications carry committed snapshots to avoid re-reads.
type Change struct {
	GameID   int            `json:"gameId"`
	Snapshot *game.Snapshot `json:"snapshot,omitempty"`
}

type Broker interface {
	Publish(change Change)
	Subscribe(func(Change))
	Close() error
}

type MemoryBroker struct {
	mu   sync.Mutex
	subs map[int]func(Change)
	next int
}

func NewMemoryBroker() *MemoryBroker {
	return &MemoryBroker{subs: make(map[int]func(Change))}
}

func (broker *MemoryBroker) Publish(change Change) {
	broker.mu.Lock()
	subs := make([]func(Change), 0, len(broker.subs))
	for _, sub := range broker.subs {
		subs = append(subs, sub)
	}
	broker.mu.Unlock()
	for _, sub := range subs {
		sub(change)
	}
}

func (broker *MemoryBroker) Subscribe(fn func(Change)) {
	broker.mu.Lock()
	defer broker.mu.Unlock()
	broker.next++
	broker.subs[broker.next] = fn
}

func (broker *MemoryBroker) Close() error { return nil }

const redisChannel = "sixtyfour:games"

type RedisBroker struct {
	client  *redis.Client
	ctx     context.Context
	cancel  context.CancelFunc
	publish chan []byte
	workers sync.WaitGroup
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
	broker := &RedisBroker{client: client, ctx: ctx, cancel: cancel, publish: make(chan []byte, 256)}
	broker.workers.Add(1)
	go func() {
		defer broker.workers.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case data := <-broker.publish:
				deadline, stop := context.WithTimeout(ctx, time.Second)
				if err := client.Publish(deadline, redisChannel, string(data)).Err(); err != nil {
					log.Printf("realtime broker publish failed: %v", err)
				}
				stop()
			}
		}
	}()
	return broker, nil
}

// SubscribeRemote starts delivery of remote notifications to fn. Call once;
// notifications published by this same process are echoed back by Redis and
// delivered like any other replica's, so every hub converges on pushes.
func (broker *RedisBroker) SubscribeRemote(fn func(Change)) {
	pubsub := broker.client.Subscribe(broker.ctx, redisChannel)
	deadline, cancel := context.WithTimeout(broker.ctx, 3*time.Second)
	_, err := pubsub.Receive(deadline)
	cancel()
	if err != nil {
		_ = pubsub.Close()
		log.Printf("realtime broker subscribe failed: %v", err)
		return
	}
	broker.workers.Add(1)
	go func() {
		defer broker.workers.Done()
		defer pubsub.Close()
		messages := pubsub.Channel()
		for {
			var message *redis.Message
			select {
			case <-broker.ctx.Done():
				return
			case value, ok := <-messages:
				if !ok {
					return
				}
				message = value
			}
			var change Change
			err := json.Unmarshal([]byte(message.Payload), &change)
			if err != nil {
				continue
			}
			fn(change)
		}
	}()
}

func (broker *RedisBroker) Publish(change Change) {
	data, err := json.Marshal(change)
	if err != nil {
		return
	}
	select {
	case <-broker.ctx.Done():
	case broker.publish <- data:
	default:
		log.Print("realtime broker queue full; room reconciliation will recover state")
	}
}

func (broker *RedisBroker) Subscribe(fn func(Change)) {
	broker.SubscribeRemote(fn)
}

func (broker *RedisBroker) Close() error {
	broker.cancel()
	err := broker.client.Close()
	broker.workers.Wait()
	return err
}
