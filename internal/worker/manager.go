package worker

import (
	"context"
	"fmt"
	"log"
	"private-storage/internal/repository"
	"sync"
	"time"
)

type TaskFunc func(ctx context.Context, job *repository.Job) (interface{}, error)

type Manager struct {
	repo       repository.JobRepository
	tasks      map[string]TaskFunc
	jobChan    chan *repository.Job
	wg         sync.WaitGroup
	maxWorkers int
}

func NewManager(repo repository.JobRepository, maxWorkers int) *Manager {
	return &Manager{
		repo:       repo,
		tasks:      make(map[string]TaskFunc),
		jobChan:    make(chan *repository.Job, 100),
		maxWorkers: maxWorkers,
	}
}

func (m *Manager) Register(name string, fn TaskFunc) {
	m.tasks[name] = fn
}

func (m *Manager) Start(ctx context.Context) {
	for i := 0; i < m.maxWorkers; i++ {
		m.wg.Add(1)
		go m.worker(ctx)
	}
	log.Printf("Worker manager started with %d workers", m.maxWorkers)
}

func (m *Manager) Stop() {
	close(m.jobChan)
	m.wg.Wait()
	log.Println("Worker manager stopped")
}

func (m *Manager) Enqueue(ctx context.Context, name string, payload interface{}) (string, error) {
	job := &repository.Job{
		Name:   name,
		Status: "pending",
		Payload: payload,
	}
	if err := m.repo.Create(ctx, job); err != nil {
		return "", err
	}

	m.jobChan <- job
	return job.ID, nil
}

func (m *Manager) worker(ctx context.Context) {
	defer m.wg.Done()
	for job := range m.jobChan {
		m.process(ctx, job)
	}
}

func (m *Manager) process(ctx context.Context, job *repository.Job) {
	fn, ok := m.tasks[job.Name]
	if !ok {
		errStr := fmt.Sprintf("task %s not registered", job.Name)
		job.Status = "failed"
		job.Error = errStr
		_ = m.repo.Update(ctx, job)
		return
	}

	now := time.Now()
	job.Status = "running"
	job.StartedAt = &now
	if err := m.repo.Update(ctx, job); err != nil {
		log.Printf("Failed to update job %s to running: %v", job.ID, err)
	}

	result, err := fn(ctx, job)

	completeTime := time.Now()
	job.CompletedAt = &completeTime
	job.Result = result

	if err != nil {
		job.Status = "failed"
		job.Error = err.Error()
	} else {
		job.Status = "completed"
	}

	if err := m.repo.Update(ctx, job); err != nil {
		log.Printf("Failed to update job %s to %s: %v", job.ID, job.Status, err)
	}
}
